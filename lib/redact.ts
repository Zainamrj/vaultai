export type Hit = { type: string; start: number; end: number; value: string; canon?: string };
export type RedactedEntity = {
  type: string;
  placeholder: string;
  start: number;          // position in redactedText
  end: number;
  originalStart: number;  // position in the original text
  originalEnd: number;
};

// One name word: Ahmed, Al-Rashid, O'Brien, D'Souza
const N = String.raw`(?:[A-Z]['-][A-Z][a-z]+|[A-Z][a-z]+)(?:['-][A-Z][a-z]+)*`;
const MONTH = String.raw`(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?`;
const STREET = String.raw`(?:Road|Rd|Street|St|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Place|Pl|Highway|Hwy)`;

const PATTERNS: { type: string; re: RegExp }[] = [
  { type: "SSN", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "EMAIL", re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { type: "IBAN", re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
  { type: "CARD", re: /\b(?:\d[ -]?){13,16}\b/g },
  // international numbers: +966 50 123 4567, +1 555 123 4567
  { type: "PHONE", re: /\+\d{1,3}(?:[\s.-]?\d{1,4}){2,5}\b/g },
  // local numbers: (555) 123-4567, 0501234567
  { type: "PHONE", re: /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g },
  // dates: 03/14/1985, 2026-10-12, March 14, 1985, 14 March 1985
  { type: "DATE", re: /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g },
  { type: "DATE", re: /\b\d{4}-\d{2}-\d{2}\b/g },
  { type: "DATE", re: new RegExp(String.raw`\b${MONTH}[ \t]+\d{1,2}(?:st|nd|rd|th)?,?[ \t]+\d{4}\b`, "g") },
  { type: "DATE", re: new RegExp(String.raw`\b\d{1,2}(?:st|nd|rd|th)?[ \t]+${MONTH},?[ \t]+\d{4}\b`, "g") },
  // labelled identifiers
  { type: "ACCOUNT", re: /(?<=\b(?:Account|Acct)(?:[ \t]*(?:No\.?|Number|#))?[ \t]*:?[ \t]*)\d{6,12}\b/gi },
  { type: "MRN", re: /(?<=\bMRN[ \t]*:?[ \t]*)[A-Z0-9-]{5,12}\b/g },
  // addresses: whole line after a label, or a street-style address
  { type: "ADDRESS", re: /(?<=\b(?:Address|Residence|Home address|Location)[ \t]*:[ \t]*)(?=\S)[^\r\n]+/gi },
  { type: "ADDRESS", re: new RegExp(String.raw`\b\d{1,5}[ \t]+[A-Z][\w'.-]*(?:[ \t]+[A-Z][\w'.-]*){0,3}[ \t]+${STREET}\b\.?`, "g") },
  // employer / organisation after a label
  { type: "ORG", re: new RegExp(String.raw`(?<=\b(?:Employer|Company|Organization|Organisation)[ \t]*:[ \t]*)[A-Z][\w&.-]*(?:[ \t]+[A-Z][\w&.-]*){0,3}`, "g") },
  // names: honorific + name, or a name after a label
  { type: "PERSON", re: new RegExp(String.raw`\b(?:Mr|Mrs|Ms|Dr|Prof)\.?[ \t]+${N}(?:[ \t]+${N})?`, "g") },
  {
    type: "PERSON",
    re: new RegExp(
      String.raw`(?<=\b(?:Patient|Borrower|Co-borrower|Employee|Name|Client|Applicant|Manager|Guarantor)[ \t]*:[ \t]*)${N}(?:[ \t]+${N})*`,
      "g"
    ),
  },
];

const HONORIFIC = /^(?:Mr|Mrs|Ms|Dr|Prof)\.?[ \t]+/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function collect(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const { type, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      hits.push({ type, start: m.index!, end: m.index! + m[0].length, value: m[0] });
    }
  }

  // Known person names (honorific stripped); longest names are canonical
  const names = [...new Set(hits.filter((h) => h.type === "PERSON").map((h) => h.value.replace(HONORIFIC, "")))]
    .sort((a, b) => b.length - a.length);
  const words = (n: string) => n.split(/[\s]+/);
  const canonical = (n: string) =>
    names.find(
      (full) =>
        full.toLowerCase() === n.toLowerCase() ||
        words(full).some((w) => w.toLowerCase() === n.toLowerCase()) ||
        full.toLowerCase().split(/[\s-]+/).includes(n.toLowerCase())
    ) ?? n;

  for (const h of hits) {
    if (h.type === "PERSON") h.canon = canonical(h.value.replace(HONORIFIC, ""));
  }

  // Second pass: bare first/last-name mentions elsewhere (also hyphen parts)
  for (const full of names) {
    const toks = new Set<string>();
    for (const w of words(full)) {
      toks.add(w);
      for (const part of w.split("-")) toks.add(part);
    }
    for (const tok of toks) {
      if (tok.length < 3) continue;
      const re = new RegExp(`(?<![\\w-])${esc(tok)}(?![\\w-])`, "g");
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