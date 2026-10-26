"use client";

import { useState, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";
import type { LoadedDoc } from "./doc";
import { ingestFile, loadSample } from "./ingest-client";

export function UploadZone({ onDoc }: { onDoc: (doc: LoadedDoc) => void }) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onDoc(await ingestFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    handle(e.dataTransfer.files);
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center transition-colors focus-within:ring-2 focus-within:ring-[#D2AE6D] ${
          dragging ? "border-[#D2AE6D] bg-[#D2AE6D]/10" : "border-[#28303B] bg-[#151A21] hover:border-[#4A5565]"
        }`}
      >
        <input
          type="file"
          accept=".txt,.pdf,text/plain,application/pdf"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = "";
          }}
        />
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-[#D2AE6D]" aria-hidden />
        ) : (
          <Upload className="h-6 w-6 text-[#8E99A8]" aria-hidden />
        )}
        <span className="text-sm font-medium">
          {busy ? "Redacting your document…" : "Drop a .txt or .pdf here, or click to choose a file"}
        </span>
        <span className="max-w-md text-xs leading-relaxed text-[#8E99A8]">
          Personal details are replaced before any AI model sees the text. You review the result before it is used.
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}

export function SampleButton({ onDoc }: { onDoc: (doc: LoadedDoc) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function click() {
    setBusy(true);
    setError(null);
    try {
      onDoc(await loadSample());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={click}
        disabled={busy}
        className="rounded-md bg-[#D2AE6D] px-4 py-2 text-sm font-medium text-[#0E1116] transition-colors hover:bg-[#DDBB80] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2AE6D] disabled:opacity-60"
      >
        {busy ? "Loading sample…" : "Load sample document"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
