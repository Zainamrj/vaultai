"use client";

import { useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, Copy, ShieldCheck, Trash2 } from "lucide-react";
import { auditHead, verifyAudit } from "@/lib/audit";
import type { AuditEntry, PurgeReceipt, WireRecord } from "@/types";
import { EmptyState } from "./EmptyState";
import { styleFor } from "./Highlighted";
import { countByType } from "./RedactionPreview";
import type { LoadedDoc } from "./doc";

const ENDPOINT_LABEL: Record<WireRecord["endpoint"], string> = {
  "/api/chat": "Answer",
  "/api/judge": "Verification",
  "/api/embed": "Embeddings",
  "/api/rewrite": "Query cleanup",
};

const PLACEHOLDER = /\[[A-Z][A-Z_]*_\d+\]/g;
const shortModel = (m: string) => m.replace(/^.*\//, "");
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <h2 id={id} className="text-lg font-medium">
          {title}
        </h2>
        {intro && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#8E99A8]">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

function PayloadView({ payload }: { payload: unknown }) {
  const messages = (payload as { messages?: { role?: string; content?: unknown }[] } | null)?.messages;
  const box =
    "doc-text max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[#28303B] bg-[#0A0D11] p-3 text-xs leading-5 text-[#C9CFD8]";
  if (Array.isArray(messages)) {
    return (
      <div className="space-y-3">
        {messages.map((m, i) => (
          <div key={i}>
            <p className="mb-1 text-xs font-medium text-[#8E99A8]">{m.role ?? "message"}</p>
            <pre className={box}>{typeof m.content === "string" ? m.content : JSON.stringify(m.content, null, 2)}</pre>
          </div>
        ))}
      </div>
    );
  }
  return <pre className={box}>{JSON.stringify(payload, null, 2)}</pre>;
}

export function PrivacyTab({
  docs,
  wires,
  audit,
  receipt,
  busy,
  onPurge,
  onGoToDocuments,
}: {
  docs: LoadedDoc[];
  wires: WireRecord[];
  audit: AuditEntry[];
  receipt: PurgeReceipt | null;
  /** A question is being answered: Purge waits for it to finish. */
  busy: boolean;
  onPurge: () => Promise<void>;
  onGoToDocuments: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [purging, setPurging] = useState(false);
  const [verified, setVerified] = useState<{ ok: boolean; brokenAt?: number; length: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const nameOf = (id: string) => docs.find((d) => d.docId === id)?.name ?? `${id.slice(0, 8)}…`;
  const nothing = docs.length === 0 && wires.length === 0 && audit.length === 0 && !receipt;

  if (nothing) {
    return (
      <EmptyState
        title="Nothing to show yet"
        body="After you add a document, this tab shows what was hidden from the model, every model call, and an audit log."
        action={
          <button
            type="button"
            onClick={onGoToDocuments}
            className="rounded-md bg-[#D2AE6D] px-4 py-2 text-sm font-medium text-[#0E1116] hover:bg-[#DDBB80] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2AE6D]"
          >
            Add a document
          </button>
        }
      />
    );
  }

  async function verify() {
    setVerified({ ...(await verifyAudit(audit)), length: audit.length });
  }

  async function confirmPurge() {
    setPurging(true);
    try {
      await onPurge();
    } finally {
      setPurging(false);
      dialogRef.current?.close();
    }
  }

  async function copyReceipt() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the receipt is still on screen
    }
  }

  const verifiedNow = verified && verified.length === audit.length ? verified : null;

  return (
    <div className="space-y-10">
      <p className="max-w-2xl text-sm leading-relaxed text-[#8E99A8]">
        Raw text is processed in memory by the redaction step and never stored. Only redacted text is sent to any model.
        Everything below lives in this browser tab.
      </p>

      {receipt && (
        <section
          role="status"
          aria-labelledby="receipt-title"
          className="fade-in rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="receipt-title" className="flex items-center gap-2 text-base font-medium text-emerald-200">
              <Check className="h-4 w-4" aria-hidden /> Session purged
            </h2>
            <button
              type="button"
              onClick={copyReceipt}
              className="flex items-center gap-1.5 rounded-md border border-[#28303B] px-3 py-1.5 text-xs hover:border-[#4A5565] focus-visible:outline-2 focus-visible:outline-[#D2AE6D]"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden /> {copied ? "Copied" : "Copy receipt"}
            </button>
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-[#8E99A8]">Purged at</dt>
            <dd>{receipt.purgedAt}</dd>
            <dt className="text-[#8E99A8]">Documents</dt>
            <dd>{receipt.docIds.length}</dd>
            <dt className="text-[#8E99A8]">Passages cleared</dt>
            <dd>{receipt.chunkCount}</dd>
            <dt className="text-[#8E99A8]">Document ID hash</dt>
            <dd className="doc-text break-all text-xs">{receipt.idsHash}</dd>
            {receipt.auditHead && (
              <>
                <dt className="text-[#8E99A8]">Audit log head</dt>
                <dd className="doc-text break-all text-xs">{receipt.auditHead}</dd>
              </>
            )}
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-[#8E99A8]">
            Documents, passages, embeddings, chat, the wire log and the audit log were cleared from this browser. The
            VaultAI server keeps no copy. This receipt is a tamper-evident fingerprint of what was cleared, not
            cryptographic proof of deletion.
          </p>
        </section>
      )}

      <Section id="redaction-title" title="What was hidden" intro="Counts of values replaced with placeholders, per document.">
        {docs.length === 0 ? (
          <p className="text-sm text-[#8E99A8]">No documents loaded.</p>
        ) : (
          <div className="space-y-3">
            {docs.map((d) => (
              <div key={d.docId} className="rounded-lg border border-[#28303B] bg-[#151A21] p-4">
                <p className="text-sm font-medium">{d.name}</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {countByType(d.entities).map(([type, n]) => (
                    <li key={type} className={`rounded-full px-3 py-1 text-xs ring-1 ring-inset ${styleFor(type)}`}>
                      {type} · {n}
                    </li>
                  ))}
                  {d.entities.length === 0 && <li className="text-sm text-[#8E99A8]">No values detected.</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        id="wire-title"
        title="Wire Inspector"
        intro="Every model call, newest first. Open one to see exactly what was sent to the model."
      >
        {wires.length === 0 ? (
          <p className="text-sm text-[#8E99A8]">No model calls yet. Ask a question and each call appears here.</p>
        ) : (
          <div className="space-y-2">
            {[...wires].reverse().map((w) => {
              const placeholders = JSON.stringify(w.payload ?? "").match(PLACEHOLDER)?.length ?? 0;
              return (
                <details key={w.id} className="group rounded-md border border-[#28303B] bg-[#151A21]">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-[#D2AE6D]">
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#8E99A8] transition-transform group-open:rotate-90" aria-hidden />
                    <span className="font-medium">{ENDPOINT_LABEL[w.endpoint]}</span>
                    <span className="text-[#8E99A8]">{shortModel(w.model)}</span>
                    <span className="ml-auto text-xs text-[#8E99A8]">
                      {new Date(w.ts).toLocaleTimeString()} · {seconds(w.latencyMs)}
                      {w.tokens !== undefined ? ` · ${w.tokens} tokens` : ""}
                    </span>
                  </summary>
                  <div className="space-y-3 border-t border-[#28303B] p-4">
                    <p className="text-xs text-[#8E99A8]">
                      This is the payload sent to the model. It contains {placeholders} redaction placeholder
                      {placeholders === 1 ? "" : "s"}.
                    </p>
                    <PayloadView payload={w.payload} />
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        id="audit-title"
        title="Audit log"
        intro="Each entry's hash includes the previous entry's hash, so editing or removing an earlier entry breaks the chain. This makes the log tamper-evident. It is not proof of deletion."
      >
        {audit.length === 0 ? (
          <p className="text-sm text-[#8E99A8]">No activity yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-[#28303B]">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <caption className="sr-only">Audit log</caption>
                <thead className="bg-[#151A21] text-xs text-[#8E99A8]">
                  <tr>
                    {["Time", "Action", "Documents", "Model", "Tokens", "Latency"].map((h) => (
                      <th key={h} scope="col" className="px-4 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#28303B]">
                  {audit.map((e, i) => (
                    <tr key={e.hash} className={verifiedNow && !verifiedNow.ok && verifiedNow.brokenAt === i ? "bg-rose-400/10" : ""}>
                      <td className="whitespace-nowrap px-4 py-2 text-[#8E99A8]">{new Date(e.ts).toLocaleTimeString()}</td>
                      <td className="px-4 py-2">{e.action}</td>
                      <td className="px-4 py-2">{e.docIds.map(nameOf).join(", ") || "none"}</td>
                      <td className="px-4 py-2 text-[#8E99A8]">{e.model ? shortModel(e.model) : "none"}</td>
                      <td className="px-4 py-2 text-[#8E99A8]">{e.tokens ?? "none"}</td>
                      <td className="px-4 py-2 text-[#8E99A8]">{e.latencyMs !== undefined ? seconds(e.latencyMs) : "none"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={verify}
                className="flex items-center gap-2 rounded-md border border-[#28303B] px-4 py-2 text-sm hover:border-[#4A5565] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2AE6D]"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden /> Verify log integrity
              </button>
              <span className="text-xs text-[#8E99A8]">
                Head <span className="doc-text">{auditHead(audit).slice(0, 12)}…</span>
              </span>
              {verifiedNow && (
                <span role="status" className={`text-sm ${verifiedNow.ok ? "text-emerald-300" : "text-rose-300"}`}>
                  {verifiedNow.ok
                    ? `Chain intact: ${audit.length} entries, none altered.`
                    : `Chain broken at entry ${(verifiedNow.brokenAt ?? 0) + 1}.`}
                </span>
              )}
            </div>
          </>
        )}
      </Section>

      <Section
        id="purge-title"
        title="Purge session"
        intro="Clears documents, passages, embeddings, chat, the wire log and the audit log from this browser, and gives you a receipt."
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.showModal()}
            disabled={busy || (docs.length === 0 && audit.length === 0 && wires.length === 0)}
            className="flex items-center gap-2 rounded-md border border-rose-400/40 px-4 py-2 text-sm text-rose-200 transition-colors hover:bg-rose-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Purge session
          </button>
          {busy && <span className="text-xs text-[#8E99A8]">Wait for the current answer to finish.</span>}
        </div>
      </Section>

      <dialog
        ref={dialogRef}
        aria-labelledby="purge-dialog-title"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-[#28303B] bg-[#151A21] p-6 text-[#E7EAEE] backdrop:bg-black/60"
      >
        <h2 id="purge-dialog-title" className="text-base font-medium">
          Purge this session?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#8E99A8]">
          This clears {docs.length} document{docs.length === 1 ? "" : "s"}, their passages and embeddings, the chat, the wire
          log and the audit log from this browser. It can&apos;t be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={purging}
            className="rounded-md border border-[#28303B] px-4 py-2 text-sm hover:border-[#4A5565] focus-visible:outline-2 focus-visible:outline-[#D2AE6D] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmPurge}
            disabled={purging}
            className="rounded-md bg-rose-300 px-4 py-2 text-sm font-medium text-[#0E1116] hover:bg-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200 disabled:opacity-60"
          >
            {purging ? "Purging…" : "Purge"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
