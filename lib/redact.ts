export type Hit = { type: string; start: number; end: number; value: string; canon?: string };
export type RedactedEntity = {
  type: string;
  placeholder: string;
  start: number;          // position in redactedText
  end: number;
  originalStart: number;  // position in the original text
  originalEnd: number;
};

const PATTERNS: { type: string; re: RegExp }[] = [
  { type: "SSN", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "EMAIL", re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { type: "IBAN", re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
  { type: "CARD", re: /\b(?:\d[ -]?){13,16}\b/g },
  { type: "PHONE", re: /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g },
  { type: "DATE", re: /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g },
  { type: "ACCOUNT", re: /(?<=\b(?:Account|Acct)(?:\s*(?:No\.?|Number|#))?\s*:?\s*)\d{6,12}\b/gi },
  { type: "MRN", re: /(?<=\bMRN\s*:?\s*)[A-Z0-9-]{5,12}\b/g },
  { type: "PERSON", re: /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?[ \t]+[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)?/g },
  {
    type: "PERSON",
    re: /(?<=\b(?:Patient|Borrower|Co-borrower|Employee|Name|Client|Applicant|Manager)[ \t]*:[ \t]*)[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)+/g,
  },
];

const HONORIFIC = /^(?:Mr|Mrs|Ms|Dr|Prof)\.?[ \t]+/;

function collect(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const { type, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      hits.push({ type, start: m.index!, end: m.index! + m[0].length, value: m[0] });
    }
  }

  // Known person names (honorific stripped); longest names are the canonical ones
  const names = [...new Set(hits.filter((h) => h.type === "PERSON").map((h) => h.value.replace(HONORIFIC, "")))]
    .sort((a, b) => b.length - a.length);
  const canonical = (n: string) =>
    names.find((full) => full.toLowerCase() === n.toLowerCase() || full.toLowerCase().split(/\s+/).includes(n.toLowerCase())) ?? n;

  for (const h of hits) {
    if (h.type === "PERSON") h.canon = canonical(h.value.replace(HONORIFIC, ""));
  }

  // Second pass: bare first/last-name mentions elsewhere in the text
  for (const full of names) {
    for (const tok of full.split(/\s+/)) {
      if (tok.length < 3) continue;
      const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      for (const m of text.matchAll(re)) {
        hits.push({ type: "PERSON", start: m.index!, end: m.index! + tok.length, value: tok, canon: canonical(tok) });
      }
    }
  }
  return hits;
}

export function redact(text: string) {
  const hits = collect(text);
  // Resolve overlaps: earliest start wins, then the longer match
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Hit[] = [];
  let lastEnd = -1;
  for (const h of hits) {
    if (h.start >= lastEnd) {
      kept.push(h);
      lastEnd = h.end;
    }
  }

  const counters: Record<string, number> = {};
  const seen = new Map<string, string>();
  const entities: RedactedEntity[] = [];
  let out = "";
  let cursor = 0;
  for (const h of kept) {
    const key = `${h.type}:${(h.canon ?? h.value).toLowerCase()}`;
    if (!seen.has(key)) {
      counters[h.type] = (counters[h.type] ?? 0) + 1;
      seen.set(key, `[${h.type}_${counters[h.type]}]`);
    }
    const ph = seen.get(key)!;
    out += text.slice(cursor, h.start);
    const start = out.length;
    out += ph;
    entities.push({ type: h.type, placeholder: ph, start, end: out.length, originalStart: h.start, originalEnd: h.end });
    cursor = h.end;
  }
  out += text.slice(cursor);
  return { redactedText: out, entities };
}
