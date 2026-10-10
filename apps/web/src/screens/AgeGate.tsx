import { MIN_AGE, isOldEnough } from "@plunder/core";
import { type FormEvent, useState } from "react";
import { api, supabase } from "../lib/supabase.ts";

/**
 * Prototype age check: self-declared birthdate, checked again on the server.
 * The birthdate is never stored, only that the check passed.
 */
export function AgeGate({ onVerified }: { onVerified: () => void }) {
  const [birthdate, setBirthdate] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isOldEnough(new Date(birthdate))) return setMsg(`Plunder ${MIN_AGE} yaş ve üstü içindir.`);
    try {
      if (await api.verifyAgeSelfDeclared(birthdate)) onVerified();
      else setMsg(`Plunder ${MIN_AGE} yaş ve üstü içindir.`);
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  return (
    <form className="center card stack" onSubmit={submit}>
      <h1>Yaş doğrulama</h1>
      <p className="muted">
        Doğum tarihini saklamıyoruz, sadece {MIN_AGE} yaşından büyük olduğunu kaydediyoruz. Prototipte bu bir beyan; gerçek
        sürümde yaş jetonu veya kart kontrolü gelecek.
      </p>
      <input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} required />
      <button>Devam et</button>
      {msg && <p className="note">{msg}</p>}
      <button type="button" className="link" onClick={() => supabase.auth.signOut()}>
        Çıkış yap
      </button>
    </form>
  );
}
