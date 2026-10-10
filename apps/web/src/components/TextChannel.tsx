import type { Channel, Message, Profile } from "@plunder/core";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../lib/supabase.ts";

export function TextChannel({ channel, me, names }: { channel: Channel; me: Profile; names: Record<string, string> }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api.listMessages(channel.id).then((m) => alive && setMessages(m));
    const unsub = api.subscribeMessages(channel.id, (m) =>
      setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m])),
    );
    return () => {
      alive = false;
      unsub();
    };
  }, [channel.id]);

  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try {
      await api.sendMessage(channel.id, me.id, body);
    } catch (err) {
      setError((err as Error).message);
      setDraft(body);
    }
  }

  return (
    <section className="chat">
      <ol className="messages">
        {messages.map((m) => (
          <li key={m.id} className={m.author_id === me.id ? "mine" : ""}>
            <div className="meta">
              <strong>{names[m.author_id] ?? "?"}</strong>{" "}
              <time className="muted small">
                {new Date(m.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
              </time>
            </div>
            <div className="body">{m.body}</div>
          </li>
        ))}
        <div ref={bottom} />
      </ol>
      {error && <p className="note">{error}</p>}
      <form className="composer row" onSubmit={send}>
        <input
          placeholder={`#${channel.name} kanalına yaz`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={4000}
          enterKeyHint="send"
        />
        <button disabled={!draft.trim()}>Gönder</button>
      </form>
    </section>
  );
}
