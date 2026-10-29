import { createHash } from "node:crypto";

// Daily question quota per visitor (hashed IP) plus a site-wide ceiling, kept in
// Upstash Redis through its REST API. Vercel's Upstash integration sets KV_REST_API_*.
const URL_ = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
export const DAILY_LIMIT = Number(process.env.CHAT_DAILY_LIMIT ?? 6);
const GLOBAL_LIMIT = Number(process.env.CHAT_GLOBAL_DAILY_LIMIT ?? 100);
const TTL = 2 * 24 * 3600;

export class LimitNotConfigured extends Error {}

export type Quota = { ok: true; remaining: number } | { ok: false; reason: "user" | "global"; remaining: number };

/** Visitor id: salted hash of the client IP, so raw IPs are never stored. */
export function clientId(req: Request): string {
  const ip =
    req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(`${process.env.CHAT_SALT ?? "tin-hieu-san"}:${ip}`).digest("hex").slice(0, 24);
}

/** Calendar day in Vietnam (UTC+7): the quota resets at local midnight. */
function day(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

// local runs without Redis (CHAT_ALLOW_NO_LIMIT=1) count in memory
const memory = new Map<string, number>();

async function redis(cmds: Array<Array<string | number>>): Promise<number[]> {
  if (!URL_ || !TOKEN) {
    if (process.env.CHAT_ALLOW_NO_LIMIT !== "1") throw new LimitNotConfigured("quota store missing");
    return cmds.map(([op, key]) => {
      const k = String(key);
      const v = memory.get(k) ?? 0;
      if (op === "INCR") memory.set(k, v + 1);
      if (op === "DECR") memory.set(k, v - 1);
      return memory.get(k) ?? 0;
    });
  }
  const r = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`quota store ${r.status}`);
  const out = (await r.json()) as Array<{ result?: unknown; error?: string }>;
  return out.map((x) => Number(x.result ?? 0));
}

const keys = (id: string) => [`chat:${day()}:${id}`, `chat:${day()}:all`] as const;

export async function peek(id: string): Promise<number> {
  const [user] = keys(id);
  const [used] = await redis([["GET", user]]);
  return Math.max(0, DAILY_LIMIT - used);
}

/** Count one question; refuses past the visitor's or the site's daily limit. */
export async function take(id: string): Promise<Quota> {
  const [user, all] = keys(id);
  const [used, , total] = await redis([["INCR", user], ["EXPIRE", user, TTL], ["INCR", all], ["EXPIRE", all, TTL]]);
  if (used > DAILY_LIMIT) {
    await redis([["DECR", all]]);
    return { ok: false, reason: "user", remaining: 0 };
  }
  if (total > GLOBAL_LIMIT) {
    await redis([["DECR", user], ["DECR", all]]);
    return { ok: false, reason: "global", remaining: DAILY_LIMIT - used + 1 };
  }
  return { ok: true, remaining: DAILY_LIMIT - used };
}

/** Give the question back when answering failed on our side. */
export async function refund(id: string): Promise<void> {
  const [user, all] = keys(id);
  await redis([["DECR", user], ["DECR", all]]);
}
