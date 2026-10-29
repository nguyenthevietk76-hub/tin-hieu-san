import { readFile } from "node:fs/promises";
import path from "node:path";

// The function reads the same JSON files the site serves. On Vercel they are fetched
// from the deployment itself; DATA_DIR (local tests) reads them from disk instead.
const cache = new Map<string, Promise<unknown>>();

export function loadData<T>(rel: string, origin: string): Promise<T> {
  if (!cache.has(rel)) {
    const p = (async () => {
      const dir = process.env.DATA_DIR;
      if (dir) return JSON.parse(await readFile(path.join(dir, rel), "utf8"));
      const r = await fetch(new URL(`/data/${rel}`, origin));
      if (!r.ok) throw new Error(`${r.status} /data/${rel}`);
      return r.json();
    })();
    p.catch(() => cache.delete(rel));
    cache.set(rel, p);
  }
  return cache.get(rel) as Promise<T>;
}
