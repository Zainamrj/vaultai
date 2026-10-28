"use client";

import { useMemo } from "react";
import { Highlighted, styleFor } from "./Highlighted";
import { originalRanges, redactedRanges } from "@/lib/highlight";
import type { LoadedDoc } from "./doc";

export function countByType(entities: { type: string }[]): [string, number][] {
  const m: Record<string, number> = {};
  for (const e of entities) m[e.type] = (m[e.type] ?? 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

export function RedactionPreview({
  doc,
  onApprove,
  onDiscard,
}: {
  doc: LoadedDoc;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  const counts = useMemo(() => countByType(doc.entities), [doc.entities]);
  const right = useMemo(() => redactedRanges(doc.entities), [doc.entities]);
  const left = useMemo(
    () => (doc.original === null ? [] : originalRanges(doc.original, doc.redactedText, doc.entities)),
    [doc],
  );
  const leftIncomplete = doc.original !== null && left.length < doc.entities.length;

  return (
    <section aria-labelledby="preview-title" className="space-y-5">
      <div>
        <h2 id="preview-title" className="text-lg font-medium">
          Review {doc.name}
        </h2>
        <p className="mt-1 text-sm text-[#8E99A8]">
          {doc.entities.length === 0
            ? "No personal details were detected. Check the text before using it."
            : `${doc.entities.length} personal detail${doc.entities.length === 1 ? "" : "s"} replaced with placeholders.`}{" "}
          Redaction is rule-based, so look for names or details it missed before you approve.
        </p>
      </div>

      {counts.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Redacted values by type">
          {counts.map(([type, n]) => (
            <li key={type} className={`rounded-full px-3 py-1 text-xs ring-1 ring-inset ${styleFor(type)}`}>
              {type} · {n}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium text-[#8E99A8]">Original (never sent to a model)</h3>
          <pre className="doc-text max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[#28303B] bg-[#0A0D11] p-4 text-[13px] leading-6">
            {doc.original === null ? (
              <span className="text-[#8E99A8]">
                A side-by-side original is not available for PDFs. Review the redacted text on the right.
              </span>
            ) : (
              <Highlighted text={doc.original} ranges={left} />
            )}
          </pre>
          {leftIncomplete && (
            <p className="mt-2 text-xs text-amber-300">
              Some highlights on the original could not be matched. The redacted text on the right is still accurate.
            </p>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium text-[#8E99A8]">Redacted (what the model can see)</h3>
          <pre className="doc-text max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[#28303B] bg-[#0A0D11] p-4 text-[13px] leading-6">
            <Highlighted text={doc.redactedText} ranges={right} />
          </pre>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onApprove}
          className="rounded-md bg-[#D2AE6D] px-4 py-2 text-sm font-medium text-[#0E1116] transition-colors hover:bg-[#DDBB80] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2AE6D]"
        >
          Approve and use this document
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-md border border-[#28303B] px-4 py-2 text-sm text-[#E7EAEE] transition-colors hover:border-[#4A5565] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2AE6D]"
        >
          Discard
        </button>
      </div>
    </section>
  );
}
