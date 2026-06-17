// Framework-agnostic WebRTC peer-to-peer link for a 2-player game.
//
// Two browsers connect directly over a single RTCDataChannel using manual
// copy-paste signaling (no signaling server). ICE is gathered non-trickle:
// after setLocalDescription we wait until gathering completes, then serialize
// the full localDescription into a base64 code the user copies to the peer.

import type { NetMessage, Role } from "~/game/types";

export type ConnState =
  | "idle"
  | "offering"
  | "awaiting-answer"
  | "answering"
  | "connecting"
  | "connected"
  | "failed"
  | "closed";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

/** What we serialize into a copy-paste code. */
interface SignalPayload {
  role: Role;
  sdp: RTCSessionDescriptionInit;
}

// --- unicode-safe base64 helpers --------------------------------------------

function encodeCode(payload: SignalPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeCode(code: string): SignalPayload {
  const binary = atob(code.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as SignalPayload;
}

export class PeerLink {
  state: ConnState = "idle";
  onStateChange?: (s: ConnState) => void;
  onMessage?: (msg: NetMessage) => void;
  onOpen?: () => void;

  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private _role: Role | null = null;

  get role(): Role | null {
    return this._role;
  }

  // --- HOST flow ------------------------------------------------------------

  /** Create the data channel + offer, wait for ICE, return base64 offer code. */
  async createOffer(): Promise<string> {
    this._role = "host";
    const pc = this.createPeerConnection();

    const channel = pc.createDataChannel("game");
    this.attachChannel(channel);

    this.setState("offering");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.waitForIceGathering(pc);

    this.setState("awaiting-answer");
    return encodeCode({ role: "host", sdp: this.localDescriptionInit(pc) });
  }

  /** Host applies the guest's answer code. */
  async acceptAnswer(code: string): Promise<void> {
    if (!this.pc) throw new Error("createOffer() must be called first");
    const payload = decodeCode(code);
    if (payload.role !== "guest") {
      throw new Error(
        `Expected a guest answer code, got role="${payload.role}"`,
      );
    }
    this.setState("connecting");
    await this.pc.setRemoteDescription(payload.sdp);
  }

  // --- GUEST flow -----------------------------------------------------------

  /**
   * Guest applies the host's offer code, creates an answer, waits for ICE,
   * and returns the base64 answer code to send back to the host.
   */
  async acceptOffer(code: string): Promise<string> {
    this._role = "guest";
    const payload = decodeCode(code);
    if (payload.role !== "host") {
      throw new Error(
        `Expected a host offer code, got role="${payload.role}"`,
      );
    }

    const pc = this.createPeerConnection();
    pc.ondatachannel = (ev) => this.attachChannel(ev.channel);

    this.setState("answering");
    await pc.setRemoteDescription(payload.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.waitForIceGathering(pc);

    this.setState("connecting");
    return encodeCode({ role: "guest", sdp: this.localDescriptionInit(pc) });
  }

  // --- messaging ------------------------------------------------------------

  send(msg: NetMessage): void {
    if (!this.channel || this.channel.readyState !== "open") {
      throw new Error("Data channel is not open");
    }
    this.channel.send(JSON.stringify(msg));
  }

  close(): void {
    if (this.channel) {
      try {
        this.channel.close();
      } catch {
        /* ignore */
      }
      this.channel = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        /* ignore */
      }
      this.pc = null;
    }
    this.setState("closed");
  }

  // --- internals ------------------------------------------------------------

  private createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case "failed":
        case "disconnected":
          this.setState("failed");
          break;
        case "closed":
          this.setState("closed");
          break;
      }
    };
    this.pc = pc;
    return pc;
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.onopen = () => {
      this.setState("connected");
      this.onOpen?.();
    };
    channel.onclose = () => {
      // Only downgrade if we weren't already torn down/failed.
      if (this.state === "connected") this.setState("closed");
    };
    channel.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as NetMessage;
        this.onMessage?.(msg);
      } catch {
        /* drop malformed frames */
      }
    };
  }

  /**
   * Non-trickle ICE: resolve once gathering is complete. Handles the case
   * where gathering already finished before we attached the listener.
   */
  private waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise<void>((resolve) => {
      const check = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", check);
      // Also resolve on the null end-of-candidates sentinel as a fallback.
      pc.addEventListener("icecandidate", (ev) => {
        if (ev.candidate === null) {
          pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      });
    });
  }

  /** Snapshot the (gathered) localDescription as a plain init object. */
  private localDescriptionInit(pc: RTCPeerConnection): RTCSessionDescriptionInit {
    const desc = pc.localDescription;
    if (!desc) throw new Error("No local description available");
    return { type: desc.type, sdp: desc.sdp };
  }

  private setState(s: ConnState): void {
    if (this.state === s) return;
    this.state = s;
    this.onStateChange?.(s);
  }
}
