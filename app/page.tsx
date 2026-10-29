"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { FileText, Lock, MessageSquare, ShieldCheck, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { RedactionPreview } from "@/components/RedactionPreview";
import { SampleButton, UploadZone } from "@/components/UploadZone";
import { ChatTab, type ChatMessage } from "@/components/ChatTab";
import { PrivacyTab } from "@/components/PrivacyTab";
import { usePrivacyLog } from "@/components/usePrivacyLog";
import { embedChunks, type StoredChunk } from "@/lib/rag-client";
import type { LoadedDoc } from "@/components/doc";
import type { PurgeReceipt } from "@/types";

type Tab = "chat" | "documents" | "privacy";
const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: "chat", label: "Chat", Icon: MessageSquare },
  { id: "documents", label: "Documents", Icon: FileText },
  { id: "privacy", label: "Privacy", Icon: ShieldCheck },
];

type IndexState = "indexing" | "ready" | "failed";
const chunkKey = (c: StoredChunk) => `${c.docId}:${c.id}`;

export default function Home() {
  const [tab, setTab] = useState<Tab>("documents");
  const [docs, setDocs] = useState<LoadedDoc[]>([]);
  // Session state held in the browser: embedded chunks and the conversation.
  const [store, setStore] = useState<StoredChunk[]>([]);
  const [indexState, setIndexState] = useState<Record<string, IndexState>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [receipt, setReceipt] = useState<PurgeReceipt | null>(null);
  const { audit, wires, epoch, logAudit, addWire, purgeLogs } = usePrivacyLog();
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ chat: null, documents: null, privacy: null });

  const pending = docs.find((d) => !d.approved);
  const approved = docs.filter((d) => d.approved);
  const busy = messages.some(
    (m) => m.role === "assistant" && ["retrieving", "streaming", "verifying"].includes(m.status),
  );

  const addDoc = (d: LoadedDoc) => {
    setReceipt(null);
    setDocs((prev) => [...prev.filter((x) => x.docId !== d.docId), d]);
    logAudit({ action: "ingest", docIds: [d.docId] });
  };

  function approve(doc: LoadedDoc) {
    const ep = epoch();
    // Approve right away. Chat works on keyword search until the embeddings arrive.
    const initial: StoredChunk[] = doc.chunks.map((c) => ({ ...c, docName: doc.name }));
    setStore((prev) => [...prev, ...initial]);
    setDocs((prev) => prev.map((d) => (d.docId === doc.docId ? { ...d, approved: true } : d)));
    setIndexState((prev) => ({ ...prev, [doc.docId]: "indexing" }));
    logAudit({ action: "approve", docIds: [doc.docId] }, ep);

    // Embed in the background (the endpoint can take 0.5 to 13 s) and swap the vectors in when done.
    embedChunks(doc.chunks, doc.name)
      .then(({ stored, wires: embedWires }) => {
        if (ep !== epoch()) return; // the session was purged meanwhile
        embedWires.forEach((w) => addWire("/api/embed", w, ep));
        const byKey = new Map(stored.map((c) => [chunkKey(c), c]));
        setStore((prev) => prev.map((c) => byKey.get(chunkKey(c)) ?? c));
        setIndexState((prev) => ({ ...prev, [doc.docId]: "ready" }));
      })
      .catch(() => {
        if (ep === epoch()) setIndexState((prev) => ({ ...prev, [doc.docId]: "failed" }));
      });
  }

  const discard = (id: string) => setDocs((prev) => prev.filter((d) => d.docId !== id));

  async function purge() {
    // The receipt needs the ids and the chunk count, so build it before clearing anything.
    const r = await purgeLogs(
      docs.map((d) => d.docId),
      store.length,
    );
    setDocs([]);
    setStore([]);
    setIndexState({});
    setMessages([]);
    setReceipt(r);
  }

  function onTabKey(e: KeyboardEvent<HTMLElement>) {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = TABS[next].id;
    setTab(id);
    tabRefs.current[id]?.focus();
  }

  const toDocuments = (
    <button
      type="button"
      onClick={() => setTab("documents")}
      className="rounded-md bg-[#D2AE6D] px-4 py-2 text-sm font-medium text-[#0E1116] hover:bg-[#DDBB80] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2AE6D]"
    >
      Add a document
    </button>
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2 pt-6">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-[#D2AE6D]" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">VaultAI</span>
        </div>
        <p className="text-sm text-[#8E99A8]">Only redacted text ever reaches a model.</p>
      </header>

      <nav role="tablist" aria-label="Sections" onKeyDown={onTabKey} className="mt-6 flex gap-1 border-b border-[#28303B]">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[id] = el;
              }}
              role="tab"
              id={`tab-${id}`}
              aria-selected={active}
              aria-controls={`panel-${id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(id)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#D2AE6D] ${
                active ? "border-[#D2AE6D] text-[#E7EAEE]" : "border-transparent text-[#8E99A8] hover:text-[#E7EAEE]"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          );
        })}
      </nav>

      <main className="mt-8 flex-1">
        {tab === "documents" && (
          <div role="tabpanel" id="panel-documents" aria-labelledby="tab-documents" className="space-y-8">
            {pending ? (
              <RedactionPreview doc={pending} onApprove={() => approve(pending)} onDiscard={() => discard(pending.docId)} />
            ) : (
              <div className="space-y-4">
                <UploadZone onDoc={addDoc} />
                <div className="flex flex-wrap items-center gap-3 text-sm text-[#8E99A8]">
                  <SampleButton onDoc={addDoc} />
                  <span>No file handy? Try a synthetic clinic record.</span>
                </div>
              </div>
            )}

            {approved.length > 0 && (
              <section aria-labelledby="ready-title">
                <h2 id="ready-title" className="mb-3 text-sm font-medium text-[#8E99A8]">
                  Ready to ask about
                </h2>
                <ul className="divide-y divide-[#28303B] rounded-lg border border-[#28303B] bg-[#151A21]">
                  {approved.map((d) => (
                    <li key={d.docId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <span className="font-medium">{d.name}</span>
                      <span className="text-[#8E99A8]">
                        {d.entities.length} values hidden · {d.chunks.length} passages ·{" "}
                        {indexState[d.docId] === "ready"
                          ? "semantic search ready"
                          : indexState[d.docId] === "failed"
                            ? "keyword search only"
                            : "indexing…"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {tab === "chat" && (
          <div role="tabpanel" id="panel-chat" aria-labelledby="tab-chat">
            {approved.length === 0 ? (
              <EmptyState
                title="No documents to ask about yet"
                body="Add a document and approve its redaction. Then you can ask questions about it here."
                action={toDocuments}
              />
            ) : (
              <ChatTab
                store={store}
                docCount={approved.length}
                messages={messages}
                setMessages={setMessages}
                onWire={(endpoint, wire) => addWire(endpoint, wire)}
                onAudit={(entry) => logAudit(entry)}
              />
            )}
          </div>
        )}

        {tab === "privacy" && (
          <div role="tabpanel" id="panel-privacy" aria-labelledby="tab-privacy">
            <PrivacyTab
              docs={docs}
              wires={wires}
              audit={audit}
              receipt={receipt}
              busy={busy}
              onPurge={purge}
              onGoToDocuments={() => setTab("documents")}
            />
          </div>
        )}
      </main>
    </div>
  );
}
