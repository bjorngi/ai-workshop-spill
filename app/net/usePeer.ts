// React 19 hook wrapping PeerLink with stable callbacks.
//
// The PeerLink instance lives in a ref so it survives re-renders, while the
// connection state is mirrored into useState so consuming components re-render
// on transitions. The message handler is held in a ref so re-registering it
// never recreates the underlying connection.

import { useCallback, useEffect, useRef, useState } from "react";

import type { NetMessage, Role } from "~/game/types";
import { PeerLink, type ConnState } from "~/net/webrtc";

export interface UsePeer {
  state: ConnState;
  role: Role | null;
  createOffer: () => Promise<string>;
  acceptOffer: (code: string) => Promise<string>;
  acceptAnswer: (code: string) => Promise<void>;
  send: (msg: NetMessage) => void;
  /** Register a message handler; the latest callback wins. */
  setOnMessage: (cb: (msg: NetMessage) => void) => void;
  reset: () => void;
}

export function usePeer(): UsePeer {
  const linkRef = useRef<PeerLink | null>(null);
  const messageCbRef = useRef<((msg: NetMessage) => void) | null>(null);

  const [state, setState] = useState<ConnState>("idle");
  const [role, setRole] = useState<Role | null>(null);

  // Lazily create (and wire) a PeerLink, reusing the existing one if present.
  const ensureLink = useCallback((): PeerLink => {
    if (linkRef.current) return linkRef.current;
    const link = new PeerLink();
    link.onStateChange = (s) => setState(s);
    link.onMessage = (msg) => messageCbRef.current?.(msg);
    link.onOpen = () => setRole(link.role);
    linkRef.current = link;
    return link;
  }, []);

  const createOffer = useCallback(async () => {
    const link = ensureLink();
    const code = await link.createOffer();
    setRole(link.role);
    return code;
  }, [ensureLink]);

  const acceptOffer = useCallback(
    async (code: string) => {
      const link = ensureLink();
      const answer = await link.acceptOffer(code);
      setRole(link.role);
      return answer;
    },
    [ensureLink],
  );

  const acceptAnswer = useCallback(
    async (code: string) => {
      const link = ensureLink();
      await link.acceptAnswer(code);
    },
    [ensureLink],
  );

  const send = useCallback((msg: NetMessage) => {
    linkRef.current?.send(msg);
  }, []);

  const setOnMessage = useCallback((cb: (msg: NetMessage) => void) => {
    messageCbRef.current = cb;
  }, []);

  const reset = useCallback(() => {
    linkRef.current?.close();
    linkRef.current = null;
    setState("idle");
    setRole(null);
  }, []);

  // Tear down the connection when the component unmounts.
  useEffect(() => {
    return () => {
      linkRef.current?.close();
      linkRef.current = null;
    };
  }, []);

  return {
    state,
    role,
    createOffer,
    acceptOffer,
    acceptAnswer,
    send,
    setOnMessage,
    reset,
  };
}
