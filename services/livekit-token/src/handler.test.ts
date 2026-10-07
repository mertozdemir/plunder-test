import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHandler, type Deps } from "./handler.ts";

const VOICE = "11111111-1111-1111-1111-111111111111";
const TEXT = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";

const deps: Deps = {
  livekitUrl: "wss://lk.test",
  allowedOrigins: ["http://localhost:5173"],
  async userFromJwt(jwt) {
    return jwt === "good" ? { id: "u1", name: "Ayşe" } : null;
  },
  async channelAsUser(_jwt, id) {
    if (id === VOICE) return { id, kind: "voice" };
    if (id === TEXT) return { id, kind: "text" };
    return null;
  },
  async mintToken({ identity, room }) {
    return `tok:${identity}:${room}`;
  },
};

let server: Server;
let base: string;
beforeAll(async () => {
  server = createServer(createHandler(deps));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const post = (body: unknown, jwt?: string, origin?: string) =>
  fetch(`${base}/token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });

describe("token handler", () => {
  it("issues a token for a member's voice channel", async () => {
    const res = await post({ channelId: VOICE }, "good", "http://localhost:5173");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(await res.json()).toEqual({ token: `tok:u1:${VOICE}`, room: VOICE, url: "wss://lk.test" });
  });
  it("rejects missing or bad sessions", async () => {
    expect((await post({ channelId: VOICE })).status).toBe(401);
    expect((await post({ channelId: VOICE }, "bad")).status).toBe(401);
  });
  it("rejects non-members and text channels", async () => {
    expect((await post({ channelId: OTHER }, "good")).status).toBe(403);
    expect((await post({ channelId: TEXT }, "good")).status).toBe(400);
    expect((await post({ channelId: "../etc" }, "good")).status).toBe(400);
  });
  it("does not echo CORS for unknown origins", async () => {
    const res = await post({ channelId: VOICE }, "good", "https://evil.example");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
