import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Channel, LiveKitGrant, Member, Message, Profile, Server } from "./types.ts";

export class ApiError extends Error {}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new ApiError(res.error.message);
  return res.data as T;
}

/** Thin, typed wrapper over Supabase so every client (web, Electron, Expo) speaks the same API. */
export function createApi(sb: SupabaseClient, opts: { tokenServiceUrl: string }) {
  return {
    async me(): Promise<Profile | null> {
      const { data } = await sb.auth.getUser();
      if (!data.user) return null;
      return unwrap(await sb.from("profiles").select("*").eq("id", data.user.id).single());
    },

    async verifyAgeSelfDeclared(birthdate: string): Promise<boolean> {
      return unwrap(await sb.rpc("verify_age_self_declared", { p_birthdate: birthdate }));
    },

    async listServers(): Promise<Server[]> {
      return unwrap(await sb.from("servers").select("*").order("created_at"));
    },

    async createServer(name: string): Promise<string> {
      return unwrap(await sb.rpc("create_server", { p_name: name }));
    },

    async createInvite(serverId: string, ttlHours = 168, maxUses: number | null = null): Promise<string> {
      return unwrap(
        await sb.rpc("create_invite", { p_server: serverId, p_ttl_hours: ttlHours, p_max_uses: maxUses }),
      );
    },

    async redeemInvite(code: string): Promise<string> {
      return unwrap(await sb.rpc("redeem_invite", { p_code: code }));
    },

    async listChannels(serverId: string): Promise<Channel[]> {
      return unwrap(await sb.from("channels").select("*").eq("server_id", serverId).order("position"));
    },

    async listMembers(serverId: string): Promise<Member[]> {
      return unwrap(
        await sb
          .from("server_members")
          .select("server_id, user_id, role, profiles(id, display_name)")
          .eq("server_id", serverId),
      ) as unknown as Member[];
    },

    async listMessages(channelId: string, limit = 50): Promise<Message[]> {
      const rows: Message[] = unwrap(
        await sb.from("messages").select("*").eq("channel_id", channelId).order("id", { ascending: false }).limit(limit),
      );
      return rows.reverse();
    },

    async sendMessage(channelId: string, authorId: string, body: string): Promise<void> {
      unwrap(await sb.from("messages").insert({ channel_id: channelId, author_id: authorId, body }));
    },

    subscribeMessages(channelId: string, onMessage: (m: Message) => void): () => void {
      const ch: RealtimeChannel = sb
        .channel(`messages:${channelId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
          (payload) => onMessage(payload.new as Message),
        )
        .subscribe();
      return () => void sb.removeChannel(ch);
    },

    /** Asks the Railway token service for a LiveKit join token for a voice channel. */
    async voiceToken(channelId: string): Promise<LiveKitGrant> {
      const { data } = await sb.auth.getSession();
      const jwt = data.session?.access_token;
      if (!jwt) throw new ApiError("not signed in");
      const res = await fetch(`${opts.tokenServiceUrl.replace(/\/$/, "")}/token`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ channelId }),
      });
      if (!res.ok) throw new ApiError(`token service: ${res.status} ${await res.text()}`);
      return (await res.json()) as LiveKitGrant;
    },
  };
}

export type PlunderApi = ReturnType<typeof createApi>;
