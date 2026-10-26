"use client";

import { useState } from "react";
import { FileText, Lock, MessageSquare, ShieldCheck, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { RedactionPreview, countByType } from "@/components/RedactionPreview";
import { SampleButton, UploadZone } from "@/components/UploadZone";
import { styleFor } from "@/components/Highlighted";
import type { LoadedDoc } from "@/components/doc";

type Tab = "chat" | "documents" | "privacy";
const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: "chat", label: "Chat", Icon: MessageSquare },
  { id: "documents", label: "Documents", Icon: FileText },
  { id: "privacy", label: "Privacy", Icon: ShieldCheck },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("documents");
  const [docs, setDocs] = useState<LoadedDoc[]>([]);

  const pending = docs.find((d) => !d.approved);
  const approved = docs.filter((d) => d.approved);

  const addDoc = (d: LoadedDoc) => setDocs((prev) => [...prev.filter((x) => x.docId !== d.docId), d]);
  const approve = (id: string) =>
    // TODO(3.2/3.3): embed the chunks via /api/embed here and store vectors in the session store.
    setDocs((prev) => prev.map((d) => (d.docId === id ? { ...d, approved: true } : d)));
  const discard = (id: string) => setDocs((prev) => prev.filter((d) => d.docId !== id));

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

      <nav role="tablist" aria-label="Sections" className="mt-6 flex gap-1 border-b border-[#28303B]">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={active}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#D2AE6D] ${
                active
                  ? "border-[#D2AE6D] text-[#E7EAEE]"
                  : "border-transparent text-[#8E99A8] hover:text-[#E7EAEE]"
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
              <RedactionPreview doc={pending} onApprove={() => approve(pending.docId)} onDiscard={() => discard(pending.docId)} />
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
                        {d.entities.length} values hidden · {d.chunks.length} passages
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
              <div className="space-y-4">
                <p className="text-sm text-[#8E99A8]">
                  Ready to answer questions about {approved.length} document{approved.length === 1 ? "" : "s"}.
                </p>
                {/* TODO(3.5): streaming chat UI, source cards, judge badge */}
                <input
                  disabled
                  placeholder="Chat is coming next"
                  aria-label="Question"
                  className="w-full rounded-md border border-[#28303B] bg-[#151A21] px-4 py-3 text-sm opacity-60"
                />
              </div>
            )}
          </div>
        )}

        {tab === "privacy" && (
          <div role="tabpanel" id="panel-privacy" aria-labelledby="tab-privacy">
            {docs.length === 0 ? (
              <EmptyState
                title="Nothing to show yet"
                body="After you add a document, this tab shows what was hidden from the model."
                action={toDocuments}
              />
            ) : (
              <section aria-labelledby="summary-title" className="space-y-4">
                <h2 id="summary-title" className="text-lg font-medium">
                  What was hidden
                </h2>
                {/* TODO(5.2/5.3): audit log, Wire Inspector, Purge */}
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
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
