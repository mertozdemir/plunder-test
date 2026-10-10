import { type Profile, type Server, parseInviteCode } from "@plunder/core";
import { type FormEvent, useEffect, useState } from "react";
import { go } from "../lib/route.ts";
import { api, supabase } from "../lib/supabase.ts";

export function Home({ me }: { me: Profile }) {
  const [servers, setServers] = useState<Server[] | null>(null);
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.listServers().then(setServers, (e: Error) => setMsg(e.message));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      go(`/s/${await api.createServer(name.trim())}`);
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  function join(e: FormEvent) {
    e.preventDefault();
    const code = parseInviteCode(invite);
    if (!code) return setMsg("Bu bir davet kodu ya da bağlantısı gibi görünmüyor.");
    go(`/join/${code}`);
  }

  return (
    <main className="page stack">
      <header className="row between">
        <h1>Sunucuların</h1>
        <button className="ghost" onClick={() => supabase.auth.signOut()} title={me.display_name}>
          Çıkış
        </button>
      </header>
      {servers === null ? (
        <p className="muted">Yükleniyor…</p>
      ) : servers.length === 0 ? (
        <p className="muted">Henüz bir sunucuda değilsin. Bir tane kur ya da davet koduyla katıl.</p>
      ) : (
        <ul className="list">
          {servers.map((s) => (
            <li key={s.id}>
              <a href={`#/s/${s.id}`}>{s.name}</a>
            </li>
          ))}
        </ul>
      )}
      <form className="row" onSubmit={create}>
        <input placeholder="Yeni sunucu adı" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} required />
        <button>Kur</button>
      </form>
      <form className="row" onSubmit={join}>
        <input placeholder="Davet kodu veya bağlantısı" value={invite} onChange={(e) => setInvite(e.target.value)} required />
        <button>Katıl</button>
      </form>
      {msg && <p className="note">{msg}</p>}
      <a className="muted small" href="#/lab">
        Faz 0 laboratuvarı
      </a>
    </main>
  );
}
