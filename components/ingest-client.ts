import type { IngestResponse } from "@/types";
import { SAMPLE_NAME, SAMPLE_URL, type LoadedDoc } from "./doc";

const MAX_BYTES = 4 * 1024 * 1024;

/** Sends a file to /api/ingest and returns it as a LoadedDoc. Throws Errors with user-readable messages. */
export async function ingestFile(file: File): Promise<LoadedDoc> {
  const lower = file.name.toLowerCase();
  const isPdf = lower.endsWith(".pdf");
  if (!isPdf && !lower.endsWith(".txt")) throw new Error("Only .txt and .pdf files are supported.");
  if (file.size > MAX_BYTES) throw new Error("This file is larger than 4 MB. Try a smaller one.");

  // The original is read in the browser and never sent anywhere except /api/ingest.
  const original = isPdf ? null : await file.text();

  const body = new FormData();
  body.append("file", file); // field name "file": change here if the endpoint expects another

  let res: Response;
  try {
    res = await fetch("/api/ingest", { method: "POST", body });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    let message = "The server could not read this file. Scanned (image-only) PDFs are not supported.";
    try {
      const json = (await res.json()) as { error?: unknown };
      if (typeof json.error === "string" && json.error.trim()) message = json.error;
    } catch {
      
    }
    throw new Error(message);
  }

  const data = (await res.json()) as IngestResponse;
  return {
    docId: data.docId,
    name: file.name,
    original,
    redactedText: data.redactedText,
    entities: data.entities,
    chunks: data.chunks,
    approved: false,
  };
}

/** Loads the bundled sample through the same pipeline as a real upload. */
export async function loadSample(): Promise<LoadedDoc> {
  const res = await fetch(SAMPLE_URL);
  if (!res.ok) throw new Error("The sample document is missing. Check public/samples.");
  const text = await res.text();
  return ingestFile(new File([text], SAMPLE_NAME, { type: "text/plain" }));
}
