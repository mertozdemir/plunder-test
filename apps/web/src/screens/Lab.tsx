import { type MlsBenchResult, runMlsBench } from "@plunder/core/mls";
import { useEffect, useRef, useState } from "react";
import { type DiagEntry, clearDiag, e2eeSupport, readDiag, startLoopbackTest, summarize } from "../lib/diagnostics.ts";

/** Phase 0 checks that run in the browser, with or without an account. */
export function Lab() {
  return (
    <main className="page stack">
      <header className="row between">
        <h1>Faz 0 laboratuvarı</h1>
        <a href="#/">Uygulamaya dön</a>
      </header>
      <MlsBench />
      <BackgroundAudio />
    </main>
  );
}

const fmt = (ms: number) => `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;

function MlsBench() {
  const [rows, setRows] = useState<MlsBenchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const support = e2eeSupport();

  async function run() {
    setBusy(true);
    setRows([]);
    setError(null);
    try {
      for (const n of [2, 10, 25, 50]) {
        const r = await runMlsBench(n);
        setRows((prev) => [...prev, r]);
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <section className="card stack">
      <h2>MLS + SFrame</h2>
      <p className="muted small">
        Bu cihazda N kişilik bir MLS grubu kurar, herkesin aynı SFrame anahtarını türettiğini kontrol eder ve her adımı
        ölçer.
      </p>
      <ul className="list small">
        <li>{support.scriptTransform ? "✅" : "❌"} RTCRtpScriptTransform (Safari, Firefox, yeni Chrome)</li>
        <li>{support.encodedStreams ? "✅" : "❌"} Insertable Streams (Chrome)</li>
        <li>{support.webCryptoAesGcm ? "✅" : "❌"} WebCrypto</li>
      </ul>
      <button onClick={run} disabled={busy}>
        {busy ? "Ölçülüyor…" : "Ölçümü başlat"}
      </button>
      {error && <p className="note">{error}</p>}
      {rows.length > 0 && (
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Üye</th>
                <th>Anahtar paketleri</th>
                <th>Hepsini ekle</th>
                <th>Hepsi katılsın</th>
                <th>Şifrele</th>
                <th>Çöz</th>
                <th>Anahtarlar eşit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.members}>
                  <td>{r.members}</td>
                  <td>{fmt(r.keyPackagesMs)}</td>
                  <td>{fmt(r.addAllMs)}</td>
                  <td>{fmt(r.joinAllMs)}</td>
                  <td>{fmt(r.encryptMs)}</td>
                  <td>{fmt(r.decryptMs)}</td>
                  <td>{r.keysMatch && r.roundTripOk ? "✅" : "❌"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BackgroundAudio() {
  const [entries, setEntries] = useState<DiagEntry[]>(readDiag);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const id = setInterval(() => setEntries(readDiag()), 2000);
    return () => {
      clearInterval(id);
      stop.current?.();
    };
  }, []);

  async function toggle() {
    if (running) {
      stop.current?.();
      stop.current = null;
      setRunning(false);
      return;
    }
    try {
      setError(null);
      stop.current = await startLoopbackTest(audio.current!);
      setRunning(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const v = summarize(entries);
  const text = entries
    .map((e) => `${new Date(e.t).toISOString().slice(11, 19)} ${e.hidden ? "[arka]" : "[ön]  "} ${e.kind}: ${e.msg}`)
    .join("\n");

  return (
    <section className="card stack">
      <h2>Arka planda ses</h2>
      <ol className="small">
        <li>Telefonda bu sayfayı aç (tercihen ana ekrana eklenmiş uygulama olarak).</li>
        <li>Testi başlat, mikrofona izin ver. Kulaklık takarsan yankı olmaz.</li>
        <li>Uygulamadan çık ya da ekranı kilitle, 1-2 dakika bekle, geri dön.</li>
      </ol>
      <p className="muted small">Gerçek bir sesli kanalda da aynı kayıt otomatik tutulur.</p>
      <audio ref={audio} hidden />
      <div className="row">
        <button className={running ? "danger" : ""} onClick={toggle}>
          {running ? "Testi durdur" : "Testi başlat"}
        </button>
        <button className="ghost" onClick={() => navigator.clipboard?.writeText(text)}>
          Kaydı kopyala
        </button>
        <button
          className="ghost"
          onClick={() => {
            clearDiag();
            setEntries([]);
          }}
        >
          Temizle
        </button>
      </div>
      {error && <p className="note">{error}</p>}
      {v.hiddenSamples > 0 && (
        <p>
          Arka planda ~{v.hiddenSeconds} sn: mikrofon {v.sendingWhileHidden}/{v.hiddenSamples} ölçümde ses gönderdi, ses{" "}
          {v.receivingWhileHidden}/{v.hiddenSamples} ölçümde geldi.{" "}
          {v.sendingWhileHidden === v.hiddenSamples ? "✅ Arka planda ses akmaya devam etti." : "⚠️ Arka planda ses kesildi."}
        </p>
      )}
      <pre className="log">{text || "Henüz kayıt yok."}</pre>
    </section>
  );
}
