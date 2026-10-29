"use client";

import { useCallback, useRef, useState } from "react";
import { appendAudit, buildPurgeReceipt, toWireRecord, type AuditInput } from "@/lib/audit";
import type { AuditEntry, PurgeReceipt, Wire, WireRecord } from "@/types";

/**
 * Browser-side Wire Inspector records and the hash-chained audit log.
 * `epoch` goes up on every purge, so late async work from the old session (an embedding that
 * finishes after Purge, say) can check it and skip writing to the new, empty session.
 */
export function usePrivacyLog() {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [wires, setWires] = useState<WireRecord[]>([]);
  const auditRef = useRef<AuditEntry[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const epochRef = useRef(0);

  const epoch = useCallback(() => epochRef.current, []);

  /** Appends an audit entry. Entries are queued so the hash chain never forks. */
  const logAudit = useCallback((e: Omit<AuditInput, "ts">, ep: number = epochRef.current) => {
    queue.current = queue.current
      .then(async () => {
        if (ep !== epochRef.current) return;
        const next = await appendAudit(auditRef.current, { ts: Date.now(), ...e });
        if (ep !== epochRef.current) return;
        auditRef.current = next;
        setAudit(next);
      })
      .catch(() => {});
  }, []);

  const addWire = useCallback((endpoint: WireRecord["endpoint"], wire: Wire | undefined, ep: number = epochRef.current) => {
    if (!wire || ep !== epochRef.current) return;
    setWires((prev) => [...prev, toWireRecord(endpoint, wire)]);
  }, []);

  /**
   * Writes a final "purge" audit entry, builds the receipt from it, then clears the log and the
   * wire records. The caller clears documents, chunks, vectors and chat messages.
   */
  const purgeLogs = useCallback(async (docIds: string[], chunkCount: number): Promise<PurgeReceipt> => {
    await queue.current;
    const finalLog = await appendAudit(auditRef.current, { ts: Date.now(), action: "purge", docIds });
    const receipt = await buildPurgeReceipt(docIds, chunkCount, finalLog);
    epochRef.current += 1;
    auditRef.current = [];
    queue.current = Promise.resolve();
    setAudit([]);
    setWires([]);
    return receipt;
  }, []);

  return { audit, wires, epoch, logAudit, addWire, purgeLogs };
}
