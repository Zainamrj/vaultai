// Paragraph-first chunking with overlap.
// Extracted PDF text often has single newlines and no blank lines, so a "paragraph" can be the
// whole document. Oversized paragraphs are therefore split again: by line/sentence first, and only
// as a last resort by a hard cut at the last space (never in the middle of a [PLACEHOLDER_1]).

/** Cuts a string with no break points into pieces of at most `size`, preferring spaces. */
function hardSplit(s: string, size: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > size) {
    let cut = rest.lastIndexOf(" ", size);
    if (cut < size / 2) cut = size; // no usable space: cut at the limit
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Splits one oversized paragraph on line breaks and sentence ends, packing pieces up to `size`. */
function splitLong(p: string, size: number): string[] {
  const units = p.split(/(?<=[.!?])\s+|\n/).map((u) => u.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const u of units) {
    if (u.length > size) {
      if (cur) out.push(cur);
      cur = "";
      out.push(...hardSplit(u, size));
    } else if (cur && (cur + " " + u).length > size) {
      out.push(cur);
      cur = u;
    } else {
      cur = cur ? cur + " " + u : u;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Last `overlap` characters of `text`, starting at a word boundary so no token is cut in half. */
function overlapTail(text: string, overlap: number): string {
  const tail = text.slice(-overlap);
  if (tail.length === text.length) return tail; // whole text already fits in the overlap
  const ws = tail.search(/\s/);
  return ws >= 0 ? tail.slice(ws + 1) : "";
}

export function chunk(text: string, size = 900, overlap = 150): string[] {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length > size ? splitLong(p, size) : [p]));

  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && (cur + "\n\n" + p).length > size) {
      chunks.push(cur);
      const tail = overlapTail(cur, overlap);
      cur = tail ? tail + "\n\n" + p : p;
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
