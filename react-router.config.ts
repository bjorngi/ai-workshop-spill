import type { Config } from "@react-router/dev/config";

export default {
  // SPA mode: the game is fully client-side (WebRTC, pointer drag, in-memory
  // state) with no server data needs. Avoids SSR/hydration issues with
  // browser-only APIs like RTCPeerConnection. See DECISIONS.md.
  ssr: false,
  future: {
    v8_middleware: true,
    v8_passThroughRequests: true,
    v8_splitRouteModules: true,
    v8_trailingSlashAwareDataRequests: true,
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
