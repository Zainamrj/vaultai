"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { AlertTriangle, Check, Loader2, Send, X } from "lucide-react";
import { judgeAnswer, retrieve, streamAnswer, type StoredChunk } from "@/lib/rag-client";
import type { AuditInput } from "@/lib/audit";
import type { JudgeResponse, Wire, WireRecord } from "@/types";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: "done" | "retrieving" | "streaming" | "verifying" | "error";
  /** Retrieved chunks in the order they were sent to the model: citation [n] means sources[n - 1]. */
  sources: StoredChunk[];
  /** How retrieval ran: "all", "hybrid", "keyword-fallback" or "keyword". */
  mode?: string;
  /** Wire records for the Wire Inspector (what was sent to the model, which model, latency). */
  retrieveWire?: Wire;
  answerWire?: Wire;
  judge?: JudgeResponse | null;
  /** The first answer, kept when the judge regenerated it. `text` then holds the revised answer. */
  originalText?: string;
  judgeFailed?: boolean;
  error?: string;
};

const SUGGESTIONS = [
  "What medications are in the treatment plan?",
  "What were the lab results?",
  "What is the patient's SSN?",
];

const BADGE: Record<string, { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "bg-emerald-400/15 text-emerald-200 ring-emerald-400/40" },
  partial: { label: "Partially supported", cls: "bg-amber-400/15 text-amber-200 ring-amber-400/40" },
  unverified: { label: "Unverified", cls: "bg-rose-400/15 text-rose-200 ring-rose-400/40" },
};

// Only digits in brackets are citations. [SSN_1], [PERSON_1] etc. are redaction placeholders.
const TOKEN_SPLIT = /(\[\d+\]|\[[A-Z][A-Z_]*_\d+\])/g;
const CITATION = /^\[(\d+)\]$/;

function citedNumbers(text: string, max: number): number[] {
  const seen = new Set<number>();
  for (const m of text.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= max) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

function wireLabel(w: Wire | undefined): string | null {
  if (!w?.model) return null;
  const name = w.model.replace(/^.*\//, "");
  return typeof w.latencyMs === "number" ? `${name} · ${(w.latencyMs / 1000).toFixed(1)} s` : name;
}

function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-[#D2AE6D]");
  setTimeout(() => el.classList.remove("ring-2", "ring-[#D2AE6D]"), 1200);
}

function AnswerText({ text, msgId, maxSource }: { text: string; msgId: string; maxSource: number }) {
  return (
    <>
      {text.split(TOKEN_SPLIT).map((part, i) => {
        const cite = CITATION.exec(part);
        if (cite) {
          const n = Number(cite[1]);
          if (n < 1 || n > maxSource) return <span key={i}>{part}</span>;
          return (
            <button
              key={i}
              type="button"
              onClick={() => jumpTo(`src-${msgId}-${n}`)}
              className="mx-0.5 rounded bg-[#D2AE6D]/15 px-1 text-xs font-medium text-[#D2AE6D] hover:bg-[#D2AE6D]/25 focus-visible:outline-2 focus-visible:outline-[#D2AE6D]"
              aria-label={`Jump to source ${n}`}
            >
              {n}
            </button>
          );
        }
        if (/^\[[A-Z]/.test(part)) {
          return (
            <span key={i} className="doc-text rounded bg-[#28303B] px-1 text-[13px] text-[#C9CFD8]" title="Redacted value">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function AssistantMessage({ m }: { m: ChatMessage }) {
  const sourceCount = m.sources.length;
  const cited = citedNumbers(m.text, sourceCount);
  const badge = BADGE[m.judge?.verdict ?? ""] ?? BADGE.unverified;
  const claims = m.judge?.claims ?? [];
  const supported = claims.filter((c) => c.supported).length;
  const isMock = m.text.startsWith("[MOCK]");
  const verifyFailed = m.judgeFailed || m.judge?.verificationFailed;
  const chips = [wireLabel(m.answerWire), wireLabel(m.judge?.wire)].filter((c): c is string => Boolean(c));

  return (
    <div className="max-w-[46rem] rounded-lg border border-[#28303B] bg-[#151A21] px-4 py-3">
      {m.status === "retrieving" && (
        <p className="flex items-center gap-2 text-sm text-[#8E99A8]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Searching your documents…
        </p>
      )}

      {m.status !== "retrieving" && m.status !== "error" && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          <AnswerText text={m.text} msgId={m.id} maxSource={sourceCount} />
          {m.status === "streaming" && <span className="ml-0.5 animate-pulse text-[#D2AE6D]">▍</span>}
        </p>
      )}

      {m.originalText !== undefined && (
        <div className="mt-3 text-xs text-[#8E99A8]">
          <p>
            Revised: the first answer scored {m.judge?.firstAttempt?.score ?? "low"}/5, so it was regenerated and checked
            again. The badge below applies to this version.
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer hover:text-[#E7EAEE]">Show the first answer</summary>
            <p className="mt-2 whitespace-pre-wrap rounded-md border border-[#28303B] bg-[#0A0D11] p-3 text-[13px] leading-relaxed text-[#C9CFD8]">
              {m.originalText}
            </p>
          </details>
        </div>
      )}

      {m.status === "error" && (
        <p role="alert" className="flex items-start gap-2 text-sm text-rose-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {m.error ?? "Something went wrong. Try again."}
        </p>
      )}

      {m.status === "verifying" && (
        <p className="mt-3 flex items-center gap-2 text-xs text-[#8E99A8]" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Verifying…
        </p>
      )}

      {m.status === "done" && m.judge && !m.judge.verificationFailed && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${badge.cls}`}>{badge.label}</span>
            {claims.length > 0 && (
              <span className="text-xs text-[#8E99A8]">
                {supported} of {claims.length} claims supported
              </span>
            )}
          </div>
          {claims.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-[#8E99A8] hover:text-[#E7EAEE]">Show claim check</summary>
              <ul className="mt-2 space-y-2">
                {claims.map((c, i) => {
                  const n = Number(c.sourceChunkId);
                  const linkable = Number.isInteger(n) && n >= 1 && n <= sourceCount;
                  return (
                    <li
                      key={i}
                      className={`flex gap-2 rounded-md px-2 py-1.5 text-[13px] ${c.supported ? "" : "bg-rose-400/10 ring-1 ring-inset ring-rose-400/30"}`}
                    >
                      {c.supported ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-label="Supported" />
                      ) : (
                        <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-label="Unsupported" />
                      )}
                      <span>
                        {c.text}
                        {linkable && c.supported && (
                          <button
                            type="button"
                            onClick={() => jumpTo(`src-${m.id}-${n}`)}
                            className="ml-2 text-xs text-[#D2AE6D] underline-offset-2 hover:underline"
                          >
                            source {n}
                          </button>
                        )}
                        {c.note && <span className="mt-0.5 block text-xs text-[#8E99A8]">{c.note}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      )}

      {m.status === "done" && verifyFailed && (
        <p className="mt-3 text-xs text-amber-300">Could not verify this answer. Treat it as unchecked.</p>
      )}

      {m.mode === "keyword-fallback" && (
        <p className="mt-3 text-xs text-[#8E99A8]">Semantic search was unavailable, so this answer used keyword search.</p>
      )}

      {isMock && (
        <p className="mt-3 text-xs text-[#8E99A8]">Mock mode: this is a placeholder answer. No model was called.</p>
      )}

      {cited.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-[#8E99A8]">Sources cited</p>
          <ul className="space-y-2">
            {cited.map((n) => {
              const src = m.sources[n - 1];
              const info = { text: src?.text ?? "", doc: src?.docName };
              return (
                <li key={n} id={`src-${m.id}-${n}`} className="scroll-mt-24 rounded-md border border-[#28303B] bg-[#0A0D11] p-3">
                  <p className="text-xs font-medium text-[#8E99A8]">
                    Source {n}
                    {info.doc ? ` · ${info.doc}` : ""}
                  </p>
                  <p className="doc-text mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-[#C9CFD8]">
                    {info.text}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {chips.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Models used">
          {chips.map((c) => (
            <li key={c} className="rounded-full border border-[#28303B] px-2.5 py-0.5 text-[11px] text-[#8E99A8]">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChatTab({
  store,
  docCount,
  messages,
  setMessages,
  onWire,
  onAudit,
}: {
  store: StoredChunk[];
  docCount: number;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  /** Called for every model call, so the Wire Inspector can show it. */
  onWire: (endpoint: WireRecord["endpoint"], wire: Wire | undefined) => void;
  /** Called for every action, so the audit log can record it. */
  onAudit: (entry: Omit<AuditInput, "ts">) => void;
}) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const busy = messages.some((m) => m.role === "assistant" && ["retrieving", "streaming", "verifying"].includes(m.status));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question || busy) return;
    setInput("");

    const id = crypto.randomUUID();
    const aid = `${id}-a`;
    setMessages((prev) => [
      ...prev,
      { id: `${id}-q`, role: "user", text: question, status: "done", sources: [] },
      { id: aid, role: "assistant", text: "", status: "retrieving", sources: [] },
    ]);
    const patch = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === aid ? fn(m) : m)));

    try {
      const found = await retrieve(question, store, 4);
      const top = found.hits.map((h) => h.chunk);
      const docIds = [...new Set(top.map((c) => c.docId))];
      onWire("/api/embed", found.wire);
      onWire("/api/rewrite", found.rewrite?.wire);
      patch((m) => ({ ...m, status: "streaming", sources: top, mode: found.mode, retrieveWire: found.wire }));

      const res = await streamAnswer(question, top, (_piece, soFar) => patch((m) => ({ ...m, text: soFar })));
      patch((m) => ({ ...m, text: res.text, status: "verifying", answerWire: res.wire }));
      onWire("/api/chat", res.wire);
      onAudit({ action: "ask", docIds, model: res.wire.model, latencyMs: res.wire.latencyMs });

      try {
        const judge = await judgeAnswer(question, res.text, top, { regenerate: true });
        // If the judge regenerated the answer, show the revised text: the verdict is for that version.
        const revised = judge.revisedAnswer?.trim();
        patch((m) => ({ ...m, judge, status: "done", ...(revised ? { text: revised, originalText: m.text } : {}) }));
        onWire("/api/judge", judge.wire);
        onAudit({ action: "judge", docIds, model: judge.wire.model, tokens: judge.wire.tokens, latencyMs: judge.wire.latencyMs });
        if (judge.regenWire) {
          onWire("/api/judge", judge.regenWire);
          onAudit({ action: "regenerate", docIds, model: judge.regenWire.model, tokens: judge.regenWire.tokens, latencyMs: judge.regenWire.latencyMs });
        }
      } catch {
        patch((m) => ({ ...m, judgeFailed: true, status: "done" }));
      }
    } catch (e) {
      patch((m) => ({ ...m, status: "error", error: e instanceof Error ? e.message : "Something went wrong. Try again." }));
    }
  }

  return (
    <div className="flex flex-col">
      <p className="mb-4 text-sm text-[#8E99A8]">
        Asking about {docCount} document{docCount === 1 ? "" : "s"}. Your question is redacted before it is sent.
      </p>

      <div role="log" aria-label="Conversation" className="space-y-4">
        {messages.length === 0 && (
          <div className="rounded-lg border border-dashed border-[#28303B] px-5 py-8 text-center">
            <p className="text-sm text-[#8E99A8]">Ask a question about your documents. Try one of these:</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="rounded-full border border-[#28303B] px-3 py-1.5 text-xs text-[#E7EAEE] transition-colors hover:border-[#D2AE6D] focus-visible:outline-2 focus-visible:outline-[#D2AE6D]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[40rem] rounded-lg bg-[#1B222B] px-4 py-2.5 text-sm leading-relaxed">{m.text}</p>
            </div>
          ) : (
            <AssistantMessage key={m.id} m={m} />
          ),
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-0 mt-6 flex gap-2 bg-[#0E1116] pb-4 pt-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          aria-label="Question"
          placeholder={busy ? "Working on your last question…" : "Ask about your documents"}
          className="min-w-0 flex-1 rounded-md border border-[#28303B] bg-[#151A21] px-4 py-3 text-sm placeholder:text-[#8E99A8] focus-visible:outline-2 focus-visible:outline-[#D2AE6D] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || input.trim() === ""}
          className="flex items-center gap-2 rounded-md bg-[#D2AE6D] px-4 py-2 text-sm font-medium text-[#0E1116] transition-colors hover:bg-[#DDBB80] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2AE6D] disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden />
          Ask
        </button>
      </form>
    </div>
  );
}
