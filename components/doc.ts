import type { Chunk, Entity } from "@/types";

/** A document held in browser session state. */
export type LoadedDoc = {
  docId: string;
  name: string;
  /** Original text, read in the browser. null for PDFs (no client-side text extraction). */
  original: string | null;
  redactedText: string;
  entities: Entity[];
  chunks: Chunk[];
  approved: boolean;
};

export const SAMPLE_URL = "/samples/clinic_visit_summary.txt";
export const SAMPLE_NAME = "clinic_visit_summary.txt";
