import { useSyncExternalStore } from "react";

import { getVolume, getVolumeCap, subscribeVolume } from "./sound";

export { playSound } from "./sound";

/** Reactive current master volume (re-renders when it changes). */
export function useVolume(): { volume: number; cap: number } {
  const volume = useSyncExternalStore(
    subscribeVolume,
    getVolume,
    () => getVolume(),
  );
  return { volume, cap: getVolumeCap() };
}
