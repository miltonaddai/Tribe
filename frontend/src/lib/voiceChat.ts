import type { Room } from "colyseus.js";

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

type VoiceSignal = {
  fromSession: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type VoicePeer = {
  connection: RTCPeerConnection;
  audio: HTMLAudioElement;
  pendingCandidates: RTCIceCandidateInit[];
};

function iceServers(): RTCIceServer[] {
  const configured = import.meta.env.VITE_VOICE_ICE_SERVERS;
  if (!configured) return DEFAULT_ICE_SERVERS;
  try {
    const parsed = JSON.parse(configured) as RTCIceServer[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ICE_SERVERS;
  } catch {
    console.warn("[voice] VITE_VOICE_ICE_SERVERS is not valid JSON; using the default STUN server.");
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

  constructor(private room: Room) {
    room.onMessage("voice-signal", (message: VoiceSignal) => void this.handleSignal(message));
    room.onMessage("voice-ready", (message: { sessionId?: string }) => {
      const sessionId = String(message.sessionId ?? "");
      if (this.enabled && this.nearby.has(sessionId) && this.shouldInitiate(sessionId)) {
        void this.makeOffer(sessionId);
      }
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

  sampleLevel() {
    if (!this.enabled || !this.analyser || !this.levelData) return 0;
    this.analyser.getFloatTimeDomainData(this.levelData);
    let sum = 0;
    for (const sample of this.levelData) sum += sample * sample;
    const rms = Math.sqrt(sum / this.levelData.length);
    const level = Math.max(0, Math.min(1, (rms - 0.018) / 0.16));
    const smoothing = level > this.smoothedLevel ? 0.5 : 0.18;
    this.smoothedLevel += (level - this.smoothedLevel) * smoothing;
    return this.smoothedLevel;
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
    audio.playsInline = true;
    audio.setAttribute("aria-hidden", "true");
    audio.style.display = "none";
    document.body.appendChild(audio);

    const peer: VoicePeer = { connection, audio, pendingCandidates: [] };
    this.peers.set(sessionId, peer);
    for (const track of this.stream?.getTracks() ?? []) connection.addTrack(track, this.stream!);

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.room.send("voice-signal", { toSession: sessionId, candidate: event.candidate.toJSON() });
      }
    };
    connection.ontrack = (event) => {
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      void audio.play().catch(() => undefined);
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
    peer.audio.srcObject = null;
    peer.audio.remove();
    this.peers.delete(sessionId);
  }

  private stopStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
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
