import { useEffect, useState } from "react";
import { go } from "../lib/route.ts";
import { api } from "../lib/supabase.ts";

export function Join({ code }: { code: string }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.redeemInvite(code).then(
      (serverId) => go(`/s/${serverId}`),
      () => setError("Davet geçersiz, süresi dolmuş ya da kullanım hakkı bitmiş."),
    );
  }, [code]);
  return (
    <div className="center card stack">
      <p>{error ?? "Sunucuya katılıyorsun…"}</p>
      {error && <a href="#/">Ana sayfaya dön</a>}
    </div>
  );
}
