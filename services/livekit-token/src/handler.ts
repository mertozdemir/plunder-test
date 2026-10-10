import type { IncomingMessage, ServerResponse } from "node:http";

export interface Channel {
  id: string;
  kind: "text" | "voice";
}

export interface Deps {
  /** Resolves a Supabase access token to a user id, or null if invalid. */
  userFromJwt(jwt: string): Promise<{ id: string; name: string } | null>;
  /** Reads the channel as that user (RLS hides it unless they are a member). */
  channelAsUser(jwt: string, channelId: string): Promise<Channel | null>;
  mintToken(opts: { identity: string; name: string; room: string }): Promise<string>;
  livekitUrl: string;
  allowedOrigins: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, limit = 4096): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw new Error("body too large");
  }
  return JSON.parse(raw || "{}");
}

export function createHandler(deps: Deps) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    if (origin && (deps.allowedOrigins.includes("*") || deps.allowedOrigins.includes(origin))) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "origin");
      res.setHeader("access-control-allow-headers", "authorization, content-type");
      res.setHeader("access-control-allow-methods", "POST, OPTIONS");
    }
    if (req.method === "OPTIONS") return send(res, 204, null);
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
    if (req.method !== "POST" || req.url !== "/token") return send(res, 404, { error: "not found" });

    const jwt = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    if (!jwt) return send(res, 401, { error: "missing bearer token" });

    let body: { channelId?: unknown };
    try {
      body = (await readJson(req)) as { channelId?: unknown };
    } catch {
      return send(res, 400, { error: "invalid json" });
    }
    const channelId = body.channelId;
    if (typeof channelId !== "string" || !UUID_RE.test(channelId)) {
      return send(res, 400, { error: "channelId must be a uuid" });
    }

    const user = await deps.userFromJwt(jwt);
    if (!user) return send(res, 401, { error: "invalid session" });

    const channel = await deps.channelAsUser(jwt, channelId);
    if (!channel) return send(res, 403, { error: "not a member of this channel" });
    if (channel.kind !== "voice") return send(res, 400, { error: "not a voice channel" });

    const token = await deps.mintToken({ identity: user.id, name: user.name, room: channel.id });
    return send(res, 200, { token, room: channel.id, url: deps.livekitUrl });
  };
}
