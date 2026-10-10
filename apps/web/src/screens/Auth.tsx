import { type FormEvent, useState } from "react";
import { supabase } from "../lib/supabase.ts";

export function Auth() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { data, error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { display_name: name } } });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "up" && !data.session) setMsg("E-postana gelen bağlantıyla hesabını onayla.");
  }

  return (
    <form className="center card stack" onSubmit={submit}>
      <h1>Plunder</h1>
      <p className="muted">Herkese açık sunucu yok. Arkadaşın seni davet eder, sen katılırsın.</p>
      {mode === "up" && (
        <input placeholder="Görünen ad" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} required />
      )}
      <input type="email" placeholder="E-posta" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      <input
        type="password"
        placeholder="Şifre"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
        autoComplete={mode === "in" ? "current-password" : "new-password"}
      />
      <button disabled={busy}>{mode === "in" ? "Giriş yap" : "Hesap oluştur"}</button>
      {msg && <p className="note">{msg}</p>}
      <button type="button" className="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "Hesabın yok mu? Kaydol" : "Zaten hesabın var mı? Giriş yap"}
      </button>
    </form>
  );
}
