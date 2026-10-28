// Client-side, append-only audit log + purge receipt (Day 5, tasks 5.1 and 5.4).
// Everything here runs in the browser (Web Crypto) and keeps no server state.
// Wording matters: the hash chain is TAMPER-EVIDENT. It is not "cryptographic proof of deletion".
// Only type imports from @/types, so Node can load this file in scripts/test-lib.mjs.
import type { AuditEntry, PurgeReceipt, Wire, WireRecord } from "@/types";

export const GENESIS = "GENESIS";

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type AuditInput = Omit<AuditEntry, "prevHash" | "hash">;

/** Stable JSON: same entry always serialises the same way, whatever the key order. */
const canonical = (e: AuditInput) => JSON.stringify(e, Object.keys(e).sort());

/** Returns a NEW log with the entry appended; the input array is never mutated. */
export async function appendAudit(log: AuditEntry[], e: AuditInput): Promise<AuditEntry[]> {
  const prevHash = log.at(-1)?.hash ?? GENESIS;
  const hash = await sha256(prevHash + canonical(e));
  return [...log, { ...e, prevHash, hash }];
}

/**
 * Recomputes the chain. Any edited, removed, reordered or inserted entry breaks it.
 * (Truncating the END of the log cannot be detected by the chain alone: show the head hash.)
 */
export async function verifyAudit(log: AuditEntry[]): Promise<{ ok: boolean; brokenAt?: number }> {
  let prev = GENESIS;
  for (let i = 0; i < log.length; i++) {
    const { prevHash, hash, ...rest } = log[i];
    if (prevHash !== prev) return { ok: false, brokenAt: i };
    if ((await sha256(prev + canonical(rest))) !== hash) return { ok: false, brokenAt: i };
    prev = hash;
  }
  return { ok: true };
}

/** Hash of the newest entry: a short fingerprint of the whole log, shown next to "Verify". */
export const auditHead = (log: AuditEntry[]): string => log.at(-1)?.hash ?? GENESIS;

/** Turns the `wire` object an API route returned into a Wire Inspector record. */
export function toWireRecord(endpoint: WireRecord["endpoint"], w: Wire): WireRecord {
  return {
    id: crypto.randomUUID(),
    ts: Date.now(),
    endpoint,
    model: w.model,
    payload: w.payload,
    tokens: w.tokens,
    latencyMs: w.latencyMs,
  };
}

/**
 * Builds the purge receipt. Call it BEFORE clearing state (it needs the ids and the chunk count),
 * then clear: documents, chunks, vectors, chat messages, wire records and the audit working set.
 * The server is stateless and stores nothing, so clearing browser state really ends the session.
 */
export async function buildPurgeReceipt(
  docIds: string[],
  chunkCount: number,
  log: AuditEntry[] = [],
): Promise<PurgeReceipt> {
  return {
    purgedAt: new Date().toISOString(),
    docIds: [...docIds],
    chunkCount,
    idsHash: await sha256(docIds.join(",")),
    auditHead: log.length ? auditHead(log) : undefined,
  };
}
