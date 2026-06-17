import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  // In-memory WebRTC signaling mailbox (loader/action only, no UI).
  route("api/room/:code", "routes/api.room.$code.ts"),
] satisfies RouteConfig;
