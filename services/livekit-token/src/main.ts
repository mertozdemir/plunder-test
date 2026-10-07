import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { AccessToken } from "livekit-server-sdk";
import { createHandler } from "./handler.ts";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

const SUPABASE_URL = env("SUPABASE_URL");
const SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY");
const LIVEKIT_API_KEY = env("LIVEKIT_API_KEY");
const LIVEKIT_API_SECRET = env("LIVEKIT_API_SECRET");

const asUser = (jwt: string) =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

const handler = createHandler({
  livekitUrl: env("LIVEKIT_URL"),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),

  async userFromJwt(jwt) {
    const sb = asUser(jwt);
    const { data } = await sb.auth.getUser(jwt);
    if (!data.user) return null;
    const { data: profile } = await sb.from("profiles").select("display_name").eq("id", data.user.id).single();
    return { id: data.user.id, name: profile?.display_name ?? "oyuncu" };
  },

  async channelAsUser(jwt, channelId) {
    const { data } = await asUser(jwt).from("channels").select("id, kind").eq("id", channelId).maybeSingle();
    return data;
  },

  async mintToken({ identity, name, room }) {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name, ttl: "2h" });
    at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    return at.toJwt();
  },
});

const port = Number(process.env.PORT ?? 8787);
createServer((req, res) => {
  handler(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('{"error":"internal"}');
    }
  });
}).listen(port, () => console.log(`livekit-token listening on :${port}`));
