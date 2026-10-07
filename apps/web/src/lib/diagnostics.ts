/**
 * Phase 0 check: does voice keep flowing when the PWA is in the background on a phone?
 *
 * While a voice call runs we log page lifecycle events, LiveKit connection
 * changes, microphone track state, timer stalls, and every 5 seconds how many
 * audio bytes were actually sent and received. Bytes moving while the page is
 * hidden is the answer we need; a log lands in localStorage so it survives a
 * killed tab and can be read later in the lab.
 */
import { type LocalAudioTrack, type RemoteAudioTrack, type Room, RoomEvent, Track } from "livekit-client";

export interface DiagEntry {
  t: number;
  kind: "page" | "room" | "mic" | "timer" | "sample" | "note";
  msg: string;
  hidden: boolean;
}

const KEY = "plunder.diag.v1";
const MAX = 2000;

export function readDiag(): DiagEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as DiagEntry[];
  } catch {
    return [];
  }
}

export function clearDiag() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

function append(e: DiagEntry) {
  try {
    const all = readDiag();
    all.push(e);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX)));
  } catch {
    /* storage unavailable */
  }
}

export function log(kind: DiagEntry["kind"], msg: string) {
  append({ t: Date.now(), kind, msg, hidden: document.visibilityState === "hidden" });
}

export interface BackgroundVerdict {
  hiddenSeconds: number;
  hiddenSamples: number;
  sendingWhileHidden: number;
  receivingWhileHidden: number;
}

/** Summarises the samples taken while the page was hidden. */
export function summarize(entries: DiagEntry[]): BackgroundVerdict {
  const hidden = entries.filter((e) => e.kind === "sample" && e.hidden);
  const parse = (m: string, k: string) => Number(new RegExp(`${k}=(\\d+)`).exec(m)?.[1] ?? 0);
  return {
    hiddenSamples: hidden.length,
    hiddenSeconds: hidden.length * 5,
    sendingWhileHidden: hidden.filter((e) => parse(e.msg, "sentB") > 0).length,
    receivingWhileHidden: hidden.filter((e) => parse(e.msg, "recvB") > 0).length,
  };
}

export function startDiagnostics(room: Room, label: string): () => void {
  log("note", `--- call start: ${label} · ${navigator.userAgent}`);
  const offs: Array<() => void> = [];
  const on = (target: EventTarget, ev: string, fn: () => void) => {
    target.addEventListener(ev, fn);
    offs.push(() => target.removeEventListener(ev, fn));
  };

  on(document, "visibilitychange", () => log("page", `visibility=${document.visibilityState}`));
  on(window, "pagehide", () => log("page", "pagehide"));
  on(window, "pageshow", () => log("page", "pageshow"));
  on(document, "freeze", () => log("page", "freeze"));
  on(document, "resume", () => log("page", "resume"));
  on(window, "online", () => log("page", "online"));
  on(window, "offline", () => log("page", "offline"));

  const roomEvents: Array<[RoomEvent, (...a: unknown[]) => void]> = [
    [RoomEvent.ConnectionStateChanged, (s) => log("room", `state=${String(s)}`)],
    [RoomEvent.Reconnecting, () => log("room", "reconnecting")],
    [RoomEvent.Reconnected, () => log("room", "reconnected")],
    [RoomEvent.Disconnected, (r) => log("room", `disconnected reason=${String(r)}`)],
    [RoomEvent.MediaDevicesError, (e) => log("mic", `device error ${(e as Error).message}`)],
    [RoomEvent.AudioPlaybackStatusChanged, () => log("room", `canPlaybackAudio=${room.canPlaybackAudio}`)],
  ];
  for (const [ev, fn] of roomEvents) {
    room.on(ev, fn);
    offs.push(() => room.off(ev, fn));
  }

  // Mic track: the OS may mute or end it when backgrounded.
  const watchMic = () => {
    const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined;
    const mst = mic?.mediaStreamTrack;
    if (!mst || (mst as unknown as { __diag?: boolean }).__diag) return;
    (mst as unknown as { __diag?: boolean }).__diag = true;
    mst.addEventListener("mute", () => log("mic", "track muted by system"));
    mst.addEventListener("unmute", () => log("mic", "track unmuted"));
    mst.addEventListener("ended", () => log("mic", "track ended"));
  };
  room.on(RoomEvent.LocalTrackPublished, watchMic);
  offs.push(() => room.off(RoomEvent.LocalTrackPublished, watchMic));
  watchMic();

  // Timer stalls show the page being throttled or frozen.
  let last = Date.now();
  const tick = setInterval(() => {
    const now = Date.now();
    if (now - last > 3000) log("timer", `stall ${((now - last) / 1000).toFixed(1)}s`);
    last = now;
  }, 1000);
  offs.push(() => clearInterval(tick));

  // Byte counters: the real proof audio flowed.
  let prevSent = 0;
  let prevRecv = 0;
  const sample = setInterval(async () => {
    const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined;
    const sent = (await mic?.getSenderStats().catch(() => undefined))?.bytesSent ?? 0;
    let recv = 0;
    for (const p of room.remoteParticipants.values()) {
      const t = p.getTrackPublication(Track.Source.Microphone)?.track as RemoteAudioTrack | undefined;
      recv += (await t?.getReceiverStats().catch(() => undefined))?.bytesReceived ?? 0;
    }
    log("sample", `sentB=${Math.max(0, sent - prevSent)} recvB=${Math.max(0, recv - prevRecv)} peers=${room.remoteParticipants.size}`);
    prevSent = sent;
    prevRecv = recv;
  }, 5000);
  offs.push(() => clearInterval(sample));

  return () => {
    offs.forEach((f) => f());
    log("note", "--- call end");
  };
}

/**
 * Same background check without any server: the mic goes through a local
 * WebRTC loopback (two peer connections in this page). Lets us test a phone
 * before the LiveKit VPS exists.
 */
export async function startLoopbackTest(audioEl: HTMLAudioElement): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const a = new RTCPeerConnection();
  const b = new RTCPeerConnection();
  a.onicecandidate = (e) => e.candidate && void b.addIceCandidate(e.candidate);
  b.onicecandidate = (e) => e.candidate && void a.addIceCandidate(e.candidate);
  b.ontrack = (e) => {
    audioEl.srcObject = e.streams[0] ?? new MediaStream([e.track]);
    void audioEl.play().catch(() => log("note", "autoplay blocked"));
  };
  for (const t of stream.getTracks()) a.addTrack(t, stream);
  await a.setLocalDescription(await a.createOffer());
  await b.setRemoteDescription(a.localDescription!);
  await b.setLocalDescription(await b.createAnswer());
  await a.setRemoteDescription(b.localDescription!);

  log("note", `--- loopback start · ${navigator.userAgent}`);
  const offs: Array<() => void> = [];
  const on = (target: EventTarget, ev: string, fn: () => void) => {
    target.addEventListener(ev, fn);
    offs.push(() => target.removeEventListener(ev, fn));
  };
  on(document, "visibilitychange", () => log("page", `visibility=${document.visibilityState}`));
  on(window, "pagehide", () => log("page", "pagehide"));
  on(document, "freeze", () => log("page", "freeze"));
  on(document, "resume", () => log("page", "resume"));
  const mic = stream.getAudioTracks()[0]!;
  on(mic, "mute", () => log("mic", "track muted by system"));
  on(mic, "unmute", () => log("mic", "track unmuted"));
  on(mic, "ended", () => log("mic", "track ended"));

  let last = Date.now();
  const tick = setInterval(() => {
    const now = Date.now();
    if (now - last > 3000) log("timer", `stall ${((now - last) / 1000).toFixed(1)}s`);
    last = now;
  }, 1000);

  const total = async (pc: RTCPeerConnection, type: string, field: "bytesSent" | "bytesReceived") => {
    let n = 0;
    (await pc.getStats()).forEach((s: Record<string, unknown>) => {
      if (s.type === type && s.kind === "audio") n += Number(s[field] ?? 0);
    });
    return n;
  };
  let prevSent = 0;
  let prevRecv = 0;
  const sample = setInterval(async () => {
    const sent = await total(a, "outbound-rtp", "bytesSent");
    const recv = await total(b, "inbound-rtp", "bytesReceived");
    log("sample", `sentB=${sent - prevSent} recvB=${recv - prevRecv} loopback`);
    prevSent = sent;
    prevRecv = recv;
  }, 5000);

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: "Arka plan ses testi", artist: "Plunder" });
    navigator.mediaSession.playbackState = "playing";
  }

  return () => {
    clearInterval(tick);
    clearInterval(sample);
    offs.forEach((f) => f());
    stream.getTracks().forEach((t) => t.stop());
    a.close();
    b.close();
    audioEl.srcObject = null;
    log("note", "--- loopback end");
  };
}

/** Which E2EE paths this browser offers for SFrame on WebRTC media. */
export function e2eeSupport() {
  const w = window as unknown as { RTCRtpScriptTransform?: unknown };
  const proto = (window.RTCRtpSender?.prototype ?? {}) as unknown as { createEncodedStreams?: unknown };
  return {
    scriptTransform: typeof w.RTCRtpScriptTransform !== "undefined",
    encodedStreams: typeof proto.createEncodedStreams === "function",
    webCryptoAesGcm: !!crypto?.subtle,
  };
}
