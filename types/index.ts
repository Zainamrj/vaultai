// API contract between the browser and the /api routes.
// Rule: changing a type = telling your teammate first. Fields added below are all OPTIONAL,
// so existing UI code keeps working unchanged.

export type Wire = {
  model: string;
  /** For chat/judge/rewrite this is the exact messages array sent to the model. */
  payload: unknown;
  /** Total tokens reported by the API. Absent for streamed chat (the stream does not report usage). */
  tokens?: number;
  latencyMs: number;
};

export type Entity = {
  type: string;
  placeholder: string;
  start: number;          // position in redactedText
  end: number;
  originalStart: number;  // position in originalText (for highlighting the left side)
  originalEnd: number;
};
export type Chunk = { id: string; docId: string; text: string; vector?: number[] };

export type IngestResponse = {
  docId: string;
  name: string;
  originalText: string;   // returned only so the preview can show it; never stored or logged
  redactedText: string;
  entities: Entity[];
  chunks: Chunk[];
};
export type EmbedResponse = { vectors: number[][]; wire: Wire };

export type RewriteResponse = { query: string; wire: Wire };

export type Claim = { text: string; supported: boolean; sourceChunkId?: string; note?: string };
export type JudgeResponse = {
  claims: Claim[];
  score: number;
  verdict: "verified" | "partial" | "unverified";
  wire: Wire;
  /** True when the judge call itself failed twice. Show "could not verify", not a red Unverified badge. */
  verificationFailed?: boolean;
  /** Set only when the request had regenerate: true and the first score was below 3. */
  regenerated?: boolean;
  /** The better answer after regeneration. When present, show it instead of the original text. */
  revisedAnswer?: string;
  /** Wire record of the regeneration call (Nemotron Super). */
  regenWire?: Wire;
  /** Judge result for the original answer, kept so the UI can show what changed. */
  firstAttempt?: { score: number; verdict: "verified" | "partial" | "unverified"; claims: Claim[] };
};

// ---------- Privacy tab: Wire Inspector, audit log, purge ----------

/** One entry in the Wire Inspector list: a single model call as the browser saw it. */
export type WireRecord = {
  id: string;
  ts: number;
  endpoint: "/api/embed" | "/api/chat" | "/api/judge" | "/api/rewrite";
  model: string;
  payload: unknown;
  tokens?: number;
  latencyMs: number;
};

/** Hash-chained audit entry. `hash` = SHA-256(prevHash + JSON of the entry without the two hashes). */
export type AuditEntry = {
  ts: number;
  action: "ingest" | "approve" | "ask" | "judge" | "regenerate" | "purge";
  docIds: string[];
  model?: string;
  tokens?: number;
  latencyMs?: number;
  prevHash: string;
  hash: string;
};

export type PurgeReceipt = {
  purgedAt: string;      // ISO timestamp
  docIds: string[];
  chunkCount: number;
  idsHash: string;       // SHA-256 of docIds joined by ","  (the roadmap calls this hashOfIds)
  auditHead?: string;    // hash of the last audit entry before the log was cleared
};
