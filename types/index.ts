export type Wire = { model: string; payload: unknown; tokens?: number; latencyMs: number };

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

export type Claim = { text: string; supported: boolean; sourceChunkId?: string; note?: string };
export type JudgeResponse = { claims: Claim[]; score: number; verdict: "verified" | "partial" | "unverified"; wire: Wire };
