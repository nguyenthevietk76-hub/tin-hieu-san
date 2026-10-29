import { useEffect, useState } from "react";
import type { Company, CompanyDetail, EventRec, FinSummary, Meta, Stats } from "./types";

const BASE = `${import.meta.env.BASE_URL}data/`;
const cache = new Map<string, Promise<unknown>>();

export function load<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(BASE + path).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${path}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path) as Promise<T>;
}

export interface Async<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useData<T>(path: string | null): Async<T> {
  const [state, setState] = useState<Async<T>>({ data: null, error: null, loading: !!path });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load<T>(path)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState({ data: null, error: String(e.message || e), loading: false }));
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}

export const useCompanies = () => useData<Company[]>("companies.json");
export const useEvents = () => useData<EventRec[]>("events.json");
export const useMeta = () => useData<Meta>("meta.json");
export const useStats = () => useData<Stats>("stats.json");
export const useFinance = () => useData<FinSummary>("finance.json");
export const useCompany = (t: string | undefined) =>
  useData<CompanyDetail>(t ? `company/${encodeURIComponent(t.toUpperCase())}.json` : null);
