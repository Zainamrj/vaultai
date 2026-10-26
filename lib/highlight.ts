import type { Entity } from "@/types";

export type Range = { start: number; end: number; type: string; placeholder: string };

type WithOriginal = Entity & { originalStart?: number; originalEnd?: number };

/** Ranges of placeholders inside the redacted text (offsets come straight from the API). */
export function redactedRanges(entities: Entity[]): Range[] {
  return [...entities]
    .sort((a, b) => a.start - b.start)
    .map((e) => ({ start: e.start, end: e.end, type: e.type, placeholder: e.placeholder }));
}

/**
 * Ranges of the redacted values inside the ORIGINAL text.
 *
 * Preferred: the API returns originalStart/originalEnd on each entity.
 * Fallback (works with the current contract): text between entities is identical in both
 * versions, so we walk the redacted text and find where each original value ends by locating
 * the text that follows it. If anything doesn't line up we stop and return what we have;
 * the preview then shows a notice instead of wrong highlights.
 */
export function originalRanges(original: string, redacted: string, entities: Entity[]): Range[] {
  const sorted = ([...entities] as WithOriginal[]).sort((a, b) => a.start - b.start);

  if (sorted.every((e) => typeof e.originalStart === "number" && typeof e.originalEnd === "number")) {
    return sorted.map((e) => ({
      start: e.originalStart!,
      end: e.originalEnd!,
      type: e.type,
      placeholder: e.placeholder,
    }));
  }

  const out: Range[] = [];
  let r = 0; // cursor in redacted text
  let o = 0; // cursor in original text

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const gap = redacted.slice(r, e.start);
    if (!original.startsWith(gap, o)) break;
    const start = o + gap.length;

    const next = sorted[i + 1];
    const after = redacted.slice(e.end, next ? next.start : redacted.length);

    let end: number;
    if (next) {
      if (after.length === 0) break; // adjacent entities: can't tell where one ends
      end = original.indexOf(after, start + 1);
      if (end === -1) break;
    } else {
      if (after.length === 0) end = original.length;
      else if (original.endsWith(after)) end = original.length - after.length;
      else break;
    }

    out.push({ start, end, type: e.type, placeholder: e.placeholder });
    r = e.end;
    o = end;
  }
  return out;
}
