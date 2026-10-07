import type { Channel, Profile } from "@plunder/core";
import {
  ExternalE2EEKeyProvider,
  type Participant,
  type RemoteTrack,
  Room,
  RoomEvent,
  Track,
  type VideoTrack,
} from "livekit-client";
import E2EEWorker from "livekit-client/e2ee-worker?worker";
import { useEffect, useReducer, useRef, useState } from "react";
import { startDiagnostics } from "../lib/diagnostics.ts";
import { flags } from "../lib/env.ts";
import { api } from "../lib/supabase.ts";

type Phase = "idle" | "connecting" | "connected" | "error";

const canShareScreen = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

export function VoiceChannel({
  channel,
  me,
  expanded,
  onLeave,
}: {
  channel: Channel;
  me: Profile;
  expanded: boolean;
  onLeave: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const roomRef = useRef<Room | null>(null);
  const audioRoot = useRef<HTMLDivElement>(null);

  async function join() {
    setPhase("connecting");
    setError(null);
    try {
      const grant = await api.voiceToken(channel.id);
      const keyProvider = flags.e2ee ? new ExternalE2EEKeyProvider() : null;
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        ...(keyProvider ? { e2ee: { keyProvider, worker: new E2EEWorker() } } : {}),
      });
      roomRef.current = room;

      if (keyProvider) {
        // Spike: a passphrase shared out of band. Next step is the MLS-derived per-epoch key
        // (packages/core/src/mls.ts sframeKey) passed as an ArrayBuffer here.
        await keyProvider.setKey(passphrase);
        await room.setE2EEEnabled(true);
      }

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) audioRoot.current?.appendChild(track.attach());
          rerender();
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((el) => el.remove());
          rerender();
        })
        .on(RoomEvent.ParticipantConnected, rerender)
        .on(RoomEvent.ParticipantDisconnected, rerender)
        .on(RoomEvent.ActiveSpeakersChanged, rerender)
        .on(RoomEvent.TrackMuted, rerender)
        .on(RoomEvent.TrackUnmuted, rerender)
        .on(RoomEvent.LocalTrackPublished, rerender)
        .on(RoomEvent.LocalTrackUnpublished, rerender)
        .on(RoomEvent.AudioPlaybackStatusChanged, rerender)
        .on(RoomEvent.EncryptionError, (e: Error) => setError(`Şifreleme hatası: ${e.message}`))
        .on(RoomEvent.Disconnected, () => {
          setPhase("idle");
          rerender();
        });

      await room.connect(grant.url, grant.token);
      stopDiag.current = startDiagnostics(room, channel.name);
      await room.localParticipant.setMicrophoneEnabled(true);
      setMediaSession(channel.name);
      setPhase("connected");
    } catch (err) {
      setError((err as Error).message);
      setPhase("error");
      await roomRef.current?.disconnect();
    }
  }

  const stopDiag = useRef<(() => void) | null>(null);

  async function leave() {
    stopDiag.current?.();
    stopDiag.current = null;
    await roomRef.current?.disconnect();
    roomRef.current = null;
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
    onLeave();
  }

  useEffect(
    () => () => {
      stopDiag.current?.();
      void roomRef.current?.disconnect();
    },
    [],
  );

  const room = roomRef.current;
  const local = room?.localParticipant;
  const micOn = local?.isMicrophoneEnabled ?? false;
  const sharing = local?.isScreenShareEnabled ?? false;
  const participants: Participant[] = room ? [room.localParticipant, ...room.remoteParticipants.values()] : [];
  const screens = participants
    .map((p) => ({ p, track: p.getTrackPublication(Track.Source.ScreenShare)?.track as VideoTrack | undefined }))
    .filter((s): s is { p: Participant; track: VideoTrack } => !!s.track);

  if (phase === "idle" || phase === "error") {
    return (
      <section className={`voice ${expanded ? "expanded" : "mini"} stack`}>
        <p>
          🔊 <strong>{channel.name}</strong>
        </p>
        {flags.e2ee && (
          <input
            placeholder="Şifreleme parolası (herkes aynısını girmeli)"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        )}
        <div className="row">
          <button onClick={join} disabled={flags.e2ee && !passphrase}>
            Katıl
          </button>
          <button className="ghost" onClick={onLeave}>
            Vazgeç
          </button>
        </div>
        {error && <p className="note">{error}</p>}
      </section>
    );
  }

  return (
    <section className={`voice ${expanded ? "expanded" : "mini"}`}>
      <div ref={audioRoot} hidden />
      {expanded && (
        <>
          {screens.map(({ p, track }) => (
            <figure key={p.identity} className="screen">
              <VideoView track={track} />
              <figcaption className="small muted">{p.name || p.identity} ekranını paylaşıyor</figcaption>
            </figure>
          ))}
          <ul className="list participants">
            {participants.map((p) => (
              <li key={p.identity} className={p.isSpeaking ? "speaking" : ""}>
                <span className="avatar">{(p.name || "?").slice(0, 1).toUpperCase()}</span>
                {p.name || p.identity}
                {p.identity === me.id && <span className="muted small"> (sen)</span>}
                {!p.isMicrophoneEnabled && <span className="muted small"> · sessiz</span>}
              </li>
            ))}
          </ul>
          {flags.e2ee && <p className="small muted">🔒 Uçtan uca şifreli (deneme)</p>}
        </>
      )}
      {room && !room.canPlaybackAudio && <button onClick={() => room.startAudio()}>Sesi başlat</button>}
      {error && <p className="note">{error}</p>}
      <div className="row controls">
        {!expanded && (
          <span className="small">
            <span className="dot live" /> {channel.name}
          </span>
        )}
        <button className={micOn ? "" : "danger"} onClick={() => local?.setMicrophoneEnabled(!micOn).then(rerender)}>
          {micOn ? "Mikrofon açık" : "Mikrofon kapalı"}
        </button>
        {expanded && canShareScreen && (
          <button
            className={sharing ? "danger" : "ghost"}
            onClick={() =>
              local
                ?.setScreenShareEnabled(!sharing, { audio: true })
                .then(rerender)
                .catch((e: Error) => setError(e.message))
            }
          >
            {sharing ? "Paylaşımı durdur" : "Ekranı paylaş"}
          </button>
        )}
        <button className="danger" onClick={leave}>
          Ayrıl
        </button>
      </div>
      {expanded && !canShareScreen && (
        <p className="small muted">Bu tarayıcı ekran paylaşamıyor; paylaşılan ekranları izleyebilirsin.</p>
      )}
    </section>
  );
}

function VideoView({ track }: { track: VideoTrack }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted />;
}

/** Media Session metadata makes Android treat the call as ongoing media, which helps it survive backgrounding. */
function setMediaSession(channelName: string) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: channelName, artist: "Plunder · sesli kanal" });
  navigator.mediaSession.playbackState = "playing";
}
