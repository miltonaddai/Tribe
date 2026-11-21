import type { Room } from "@colyseus/sdk";

/**
 * No STUN/TURN by default: the sandbox runs offline, and peers on the same
 * machine or LAN connect over host candidates without one. Set
 * VITE_VOICE_ICE_SERVERS to add servers if you ever need them.
 */
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [];

type VoiceSignal = {
  fromSession: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type VoicePeer = {
  connection: RTCPeerConnection;
  audio: HTMLAudioElement;
  pendingCandidates: RTCIceCandidateInit[];
  /** Reads the level of what this peer is sending us, so the HUD can show it. */
  analyser: AnalyserNode | null;
  levelData: Float32Array<ArrayBuffer> | null;
  level: number;
};

export type AudioOutput = { deviceId: string; label: string };

export type VoiceDiagnostic = {
  sessionId: string;
  /** "none" means no connection was ever attempted with this player. */
  state: RTCPeerConnectionState | "none";
  level: number;
  volume: number;
};

const OUTPUT_KEY = "block.audio-output";
/** Browsers that cannot route audio per element only ever use the system default. */
export const canPickOutput = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

export function loadOutputDevice(): string {
  try {
    return localStorage.getItem(OUTPUT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveOutputDevice(deviceId: string) {
  try {
    if (deviceId) localStorage.setItem(OUTPUT_KEY, deviceId);
    else localStorage.removeItem(OUTPUT_KEY);
  } catch {
    // Private windows can refuse writes; the choice just will not survive a reload.
  }
}

/**
 * Speakers the browser will let us route to. Labels are blank until microphone
 * permission is granted, so before voice is enabled these are numbered instead.
 */
export async function listAudioOutputs(): Promise<AudioOutput[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audiooutput")
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Speaker ${i + 1}` }));
}

export function onAudioDevicesChange(listener: () => void) {
  navigator.mediaDevices?.addEventListener?.("devicechange", listener);
  return () => navigator.mediaDevices?.removeEventListener?.("devicechange", listener);
}

/** A short tone on the chosen speaker, so picking one can be confirmed by ear. */
export async function playTestTone(deviceId: string) {
  const context = new AudioContext();
  try {
    const destination = context.createMediaStreamDestination();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    oscillator.connect(gain).connect(destination);

    const element = document.createElement("audio");
    element.autoplay = true;
    element.srcObject = destination.stream;
    document.body.appendChild(element);
    await applySink(element, deviceId);
    // Routing is async, so by now we are outside the click that authorised playback.
    if (context.state === "suspended") await context.resume();
    await element.play().catch(() => undefined);

    const now = context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
    gain.gain.setValueAtTime(0.18, now + 0.32);
    gain.gain.linearRampToValueAtTime(0, now + 0.4);
    oscillator.start(now);
    oscillator.stop(now + 0.42);

    await new Promise((resolve) => setTimeout(resolve, 520));
    element.srcObject = null;
    element.remove();
  } finally {
    await context.close();
  }
}

/** Root-mean-square of a time-domain window, gated and normalised to 0-1. */
function rmsLevel(analyser: AnalyserNode, data: Float32Array<ArrayBuffer>) {
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (const sample of data) sum += sample * sample;
  const rms = Math.sqrt(sum / data.length);
  return Math.max(0, Math.min(1, (rms - 0.018) / 0.16));
}

/** Attack fast so speech registers immediately, release slowly so it does not flicker. */
function smoothLevel(previous: number, next: number) {
  return previous + (next - previous) * (next > previous ? 0.5 : 0.18);
}

async function applySink(element: HTMLAudioElement, deviceId: string) {
  if (!canPickOutput || !deviceId) return;
  try {
    await (element as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(deviceId);
  } catch (error) {
    console.warn("[voice] could not route audio to the chosen speaker", error);
  }
}

function iceServers(): RTCIceServer[] {
  const configured = import.meta.env.VITE_VOICE_ICE_SERVERS;
  if (!configured) return DEFAULT_ICE_SERVERS;
  try {
    const parsed = JSON.parse(configured) as RTCIceServer[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ICE_SERVERS;
  } catch {
    console.warn("[voice] VITE_VOICE_ICE_SERVERS is not valid JSON; using host candidates only.");
    return DEFAULT_ICE_SERVERS;
  }
}

/** Small-room, peer-to-peer proximity voice. Colyseus is used only for WebRTC signaling. */
export class VoiceChat {
  private stream: MediaStream | null = null;
  private peers = new Map<string, VoicePeer>();
  private nearby = new Set<string>();
  private enabled = false;
  private disposed = false;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelData: Float32Array<ArrayBuffer> | null = null;
  private smoothedLevel = 0;
  private outputId = loadOutputDevice();

  constructor(private room: Room) {
    room.onMessage("voice-signal", (message: VoiceSignal) => void this.handleSignal(message));
    room.onMessage("voice-ready", (message: { sessionId?: string }) => {
      const sessionId = String(message.sessionId ?? "");
      if (!sessionId || !this.enabled) return;
      // They were not listening when we first offered — their microphone was off,
      // so handleSignal dropped it and our connection is stranded in have-local-offer.
      // Nothing retries from there, so tear it down and negotiate again from scratch.
      const peer = this.peers.get(sessionId);
      if (peer && peer.connection.connectionState !== "connected") this.closePeer(sessionId);
      if (this.nearby.has(sessionId) && this.shouldInitiate(sessionId)) void this.makeOffer(sessionId);
    });
    room.onMessage("voice-left", (message: { sessionId?: string }) => {
      this.closePeer(String(message.sessionId ?? ""));
    });
  }

  async enable() {
    if (this.enabled) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access is not supported by this browser.");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    this.startMeter(this.stream);
    if (this.disposed) {
      this.stopStream();
      return;
    }
    this.enabled = true;
    this.room.send("voice-ready");
    for (const sessionId of this.nearby) {
      if (this.shouldInitiate(sessionId)) void this.makeOffer(sessionId);
    }
  }

  disable() {
    if (!this.enabled && !this.stream) return;
    this.room.send("voice-left");
    this.enabled = false;
    for (const sessionId of [...this.peers.keys()]) this.closePeer(sessionId);
    this.stopStream();
    void this.audioContext?.close();
    this.audioContext = null;
    this.analyser = null;
    this.levelData = null;
    this.smoothedLevel = 0;
  }

  /**
   * Per-peer connection health, for the audio menu. Silent voice has several
   * indistinguishable causes — never negotiated, negotiated but not flowing, or
   * flowing but attenuated to nothing by distance — and this separates them.
   */
  diagnostics(): VoiceDiagnostic[] {
    return [...this.nearby].map((sessionId) => {
      const peer = this.peers.get(sessionId);
      return {
        sessionId,
        state: peer ? peer.connection.connectionState : "none",
        level: peer?.level ?? 0,
        volume: peer ? peer.audio.volume : 0,
      };
    });
  }

  /** Route every peer, and any future one, to this speaker. */
  async setOutputDevice(deviceId: string) {
    this.outputId = deviceId;
    saveOutputDevice(deviceId);
    await Promise.all([...this.peers.values()].map((peer) => applySink(peer.audio, deviceId)));
  }

  outputDevice() {
    return this.outputId;
  }

  sampleLevel() {
    if (!this.enabled || !this.analyser || !this.levelData) return 0;
    this.smoothedLevel = smoothLevel(this.smoothedLevel, rmsLevel(this.analyser, this.levelData));
    return this.smoothedLevel;
  }

  /**
   * Loudest voice arriving from a nearby player, 0-1. This reads the decoded
   * inbound streams, so a non-zero value is proof audio is actually flowing.
   */
  sampleNearbyLevel() {
    let loudest = 0;
    for (const peer of this.peers.values()) {
      if (!peer.analyser || !peer.levelData) continue;
      peer.level = smoothLevel(peer.level, rmsLevel(peer.analyser, peer.levelData));
      loudest = Math.max(loudest, peer.level);
    }
    return loudest;
  }

  syncNearby(distances: Map<string, number>) {
    this.nearby = new Set(distances.keys());
    for (const sessionId of [...this.peers.keys()]) {
      if (!distances.has(sessionId)) this.closePeer(sessionId);
    }
    if (!this.enabled) return;
    for (const [sessionId, distance] of distances) {
      const peer = this.peers.get(sessionId);
      if (peer) peer.audio.volume = Math.max(0, Math.min(1, 1 - Math.max(0, distance - 4) / 18));
      else if (this.shouldInitiate(sessionId)) void this.makeOffer(sessionId);
    }
  }

  dispose() {
    this.disposed = true;
    this.disable();
  }

  private shouldInitiate(remoteSession: string) {
    return this.room.sessionId.localeCompare(remoteSession) < 0;
  }

  private createPeer(sessionId: string) {
    const existing = this.peers.get(sessionId);
    if (existing) return existing;

    const connection = new RTCPeerConnection({ iceServers: iceServers() });
    const audio = document.createElement("audio");
    audio.autoplay = true;
    // Stops iOS Safari taking playback fullscreen; it is not in the DOM types for audio.
    audio.setAttribute("playsinline", "");
    audio.setAttribute("aria-hidden", "true");
    audio.style.display = "none";
    document.body.appendChild(audio);

    void applySink(audio, this.outputId);

    const peer: VoicePeer = { connection, audio, pendingCandidates: [], analyser: null, levelData: null, level: 0 };
    this.peers.set(sessionId, peer);
    for (const track of this.stream?.getTracks() ?? []) connection.addTrack(track, this.stream!);

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.room.send("voice-signal", { toSession: sessionId, candidate: event.candidate.toJSON() });
      }
    };
    connection.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      audio.srcObject = stream;
      void audio.play().catch(() => undefined);
      this.meterRemote(peer, stream);
    };
    connection.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(connection.connectionState)) this.closePeer(sessionId);
    };
    return peer;
  }

  private async makeOffer(sessionId: string) {
    if (!this.enabled || !this.nearby.has(sessionId)) return;
    const peer = this.createPeer(sessionId);
    if (peer.connection.signalingState !== "stable") return;
    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
    this.room.send("voice-signal", {
      toSession: sessionId,
      description: peer.connection.localDescription?.toJSON(),
    });
  }

  private async handleSignal(message: VoiceSignal) {
    const sessionId = String(message.fromSession ?? "");
    if (!this.enabled || !this.nearby.has(sessionId) || !sessionId) return;
    try {
      const peer = this.createPeer(sessionId);
      if (message.description) {
        await peer.connection.setRemoteDescription(message.description);
        for (const candidate of peer.pendingCandidates.splice(0)) await peer.connection.addIceCandidate(candidate);
        if (message.description.type === "offer") {
          const answer = await peer.connection.createAnswer();
          await peer.connection.setLocalDescription(answer);
          this.room.send("voice-signal", {
            toSession: sessionId,
            description: peer.connection.localDescription?.toJSON(),
          });
        }
      } else if (message.candidate) {
        if (peer.connection.remoteDescription) await peer.connection.addIceCandidate(message.candidate);
        else peer.pendingCandidates.push(message.candidate);
      }
    } catch (error) {
      console.warn("[voice] WebRTC negotiation failed", error);
      this.closePeer(sessionId);
    }
  }

  private closePeer(sessionId: string) {
    const peer = this.peers.get(sessionId);
    if (!peer) return;
    peer.connection.onicecandidate = null;
    peer.connection.ontrack = null;
    peer.connection.close();
    peer.analyser?.disconnect();
    peer.analyser = null;
    peer.levelData = null;
    peer.audio.srcObject = null;
    peer.audio.remove();
    this.peers.delete(sessionId);
  }

  private stopStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  /**
   * Tap an inbound stream for metering only. The audio element stays the thing
   * that plays it: Chrome will not pull from a remote stream that is fed to an
   * AudioContext alone, and only the element can be routed to a chosen speaker.
   */
  private meterRemote(peer: VoicePeer, stream: MediaStream) {
    if (peer.analyser || !this.audioContext) return;
    try {
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      this.audioContext.createMediaStreamSource(stream).connect(analyser);
      peer.analyser = analyser;
      peer.levelData = new Float32Array(analyser.fftSize);
    } catch (error) {
      console.warn("[voice] could not meter a remote stream", error);
    }
  }

  private startMeter(stream: MediaStream) {
    const AudioContextClass = window.AudioContext;
    this.audioContext = new AudioContextClass();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.65;
    this.levelData = new Float32Array(this.analyser.fftSize);
    this.audioContext.createMediaStreamSource(stream).connect(this.analyser);
  }
}
