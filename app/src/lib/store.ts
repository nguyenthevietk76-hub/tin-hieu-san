import { useSyncExternalStore } from "react";

/** Tiny localStorage-backed store; every access is guarded so private mode still works. */
function createStore<T>(key: string, initial: T) {
  let value: T = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw) value = JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      subs.forEach((f) => f());
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

const watch = createStore<string[]>("radar.watchlist", []);

export function useWatchlist() {
  const list = useSyncExternalStore(watch.subscribe, watch.get);
  return {
    list,
    has: (t: string) => list.includes(t),
    toggle: (t: string) => watch.set(list.includes(t) ? list.filter((x) => x !== t) : [...list, t]),
    clear: () => watch.set([]),
  };
}

// Dark is the default; light is an explicit opt-in.
type Theme = "light" | "dark";
const theme = createStore<Theme>("radar.theme", "dark");

export function useTheme() {
  const t = useSyncExternalStore(theme.subscribe, theme.get);
  return {
    theme: t,
    set(next: Theme) {
      theme.set(next);
      document.documentElement.dataset.theme = next;
      window.dispatchEvent(new Event("radar-theme"));
    },
  };
}
