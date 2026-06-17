import type { Config } from "@react-router/dev/config";

export default {
  // Framework mode (SSR): we host a tiny in-memory WebRTC *signaling* server as
  // a resource route (app/routes/api.room.$code.ts) so players can connect via a
  // short room code instead of copy-pasting SDP blobs. The game itself is still
  // client-only — all browser APIs (RTCPeerConnection, pointer drag, audio) live
  // in effects/handlers, never in render, so server-rendering the shell is safe.
  // See DECISIONS.md.
  ssr: true,
  future: {
    v8_middleware: true,
    v8_passThroughRequests: true,
    v8_splitRouteModules: true,
    v8_trailingSlashAwareDataRequests: true,
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
