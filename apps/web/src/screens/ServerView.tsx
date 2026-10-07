import { type Channel, type Member, type Profile, type Server, inviteLink } from "@plunder/core";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { TextChannel } from "../components/TextChannel.tsx";
import { go } from "../lib/route.ts";
import { api, supabase } from "../lib/supabase.ts";

// livekit-client loads only once someone opens a voice channel.
const VoiceChannel = lazy(() => import("../components/VoiceChannel.tsx").then((m) => ({ default: m.VoiceChannel })));

export function ServerView({ me, serverId, channelId }: { me: Profile; serverId: string; channelId?: string }) {
  const [server, setServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  // Voice stays connected while you read text channels, like Discord.
  const [voiceChannel, setVoiceChannel] = useState<Channel | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("servers").select("*").eq("id", serverId).maybeSingle();
      if (!data) return go("/");
      setServer(data);
      setChannels(await api.listChannels(serverId));
      setMembers(await api.listMembers(serverId));
    })();
  }, [serverId]);

  const current = useMemo(
    () => channels.find((c) => c.id === channelId) ?? channels.find((c) => c.kind === "text"),
    [channels, channelId],
  );
  const names = useMemo(
    () => Object.fromEntries(members.map((m) => [m.user_id, m.profiles?.display_name ?? "?"])),
    [members],
  );

  function open(c: Channel) {
    setDrawer(false);
    if (c.kind === "voice") setVoiceChannel(c);
    go(`/s/${serverId}/${c.id}`);
  }

  async function makeInvite() {
    const code = await api.createInvite(serverId);
    const link = inviteLink(window.location.origin, code);
    setInvite(link);
    if (navigator.share) await navigator.share({ title: `${server?.name} — Plunder daveti`, url: link }).catch(() => {});
    else await navigator.clipboard?.writeText(link).catch(() => {});
  }

  if (!server) return <div className="center muted">Yükleniyor…</div>;

  return (
    <div className="shell">
      <aside className={`drawer ${drawer ? "open" : ""}`}>
        <div className="row between">
          <a href="#/" className="muted">‹ Sunucular</a>
        </div>
        <h2>{server.name}</h2>
        <ul className="list channels">
          {channels.map((c) => (
            <li key={c.id}>
              <button className={`channel ${c.id === current?.id ? "active" : ""}`} onClick={() => open(c)}>
                <span className="muted">{c.kind === "text" ? "#" : "🔊"}</span> {c.name}
                {voiceChannel?.id === c.id && <span className="dot live" />}
              </button>
            </li>
          ))}
        </ul>
        <button onClick={makeInvite}>Davet bağlantısı oluştur</button>
        {invite && <input readOnly value={invite} onFocus={(e) => e.currentTarget.select()} />}
        <h3 className="muted small">Üyeler · {members.length}</h3>
        <ul className="list small">
          {members.map((m) => (
            <li key={m.user_id}>
              {m.profiles?.display_name} {m.role === "owner" && <span className="muted">(kurucu)</span>}
            </li>
          ))}
        </ul>
      </aside>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
      <main className="content">
        <header className="topbar">
          <button className="ghost menu" onClick={() => setDrawer(true)} aria-label="Kanallar">☰</button>
          <strong>
            {current?.kind === "voice" ? "🔊 " : "# "}
            {current?.name}
          </strong>
        </header>
        {voiceChannel && (
          <Suspense fallback={<p className="muted center">Ses yükleniyor…</p>}>
          <VoiceChannel
            channel={voiceChannel}
            me={me}
            expanded={current?.id === voiceChannel.id}
            onLeave={() => setVoiceChannel(null)}
          />
          </Suspense>
        )}
        {current?.kind === "text" && <TextChannel key={current.id} channel={current} me={me} names={names} />}
        {current?.kind === "voice" && !voiceChannel && (
          <div className="center stack">
            <button onClick={() => setVoiceChannel(current)}>Sesli kanala katıl</button>
          </div>
        )}
      </main>
    </div>
  );
}
