import type { Profile } from "@plunder/core";
import type { Session } from "@supabase/supabase-js";
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { isConfigured } from "./lib/env.ts";
import { go, useRoute } from "./lib/route.ts";
import { api, supabase } from "./lib/supabase.ts";
import { AgeGate } from "./screens/AgeGate.tsx";
import { Auth } from "./screens/Auth.tsx";
import { Home } from "./screens/Home.tsx";
import { Join } from "./screens/Join.tsx";
import { ServerView } from "./screens/ServerView.tsx";

// MLS and diagnostics are heavy and only needed in the lab.
const Lab = lazy(() => import("./screens/Lab.tsx").then((m) => ({ default: m.Lab })));

export function App() {
  const route = useRoute();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!isConfigured) return setSession(null);
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => setProfile(await api.me()), []);
  useEffect(() => {
    if (session) void refreshProfile();
    else setProfile(null);
  }, [session, refreshProfile]);

  // The lab works without an account so the Phase 0 checks can run anywhere.
  if (route.name === "lab")
    return (
      <Suspense fallback={<div className="center muted">Yükleniyor…</div>}>
        <Lab />
      </Suspense>
    );
  if (!isConfigured) return <NotConfigured />;
  if (session === undefined || (session && !profile)) return <div className="center muted">Yükleniyor…</div>;
  if (!session) return <Auth />;
  if (!profile!.age_verified_at) return <AgeGate onVerified={refreshProfile} />;

  switch (route.name) {
    case "join":
      return <Join code={route.code} />;
    case "server":
      return <ServerView me={profile!} serverId={route.serverId} channelId={route.channelId} />;
    default:
      return <Home me={profile!} />;
  }
}

function NotConfigured() {
  return (
    <div className="center card">
      <h1>Plunder</h1>
      <p>
        Supabase ayarları eksik. <code>apps/web/.env.local</code> dosyasına <code>VITE_SUPABASE_URL</code> ve{" "}
        <code>VITE_SUPABASE_ANON_KEY</code> ekle.
      </p>
      <button onClick={() => go("/lab")}>Faz 0 laboratuvarını aç</button>
    </div>
  );
}
