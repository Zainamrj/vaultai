export function chunk(text: string, size = 900, overlap = 150): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && (cur + "\n\n" + p).length > size) {
      chunks.push(cur);
      cur = cur.slice(-overlap) + "\n\n" + p;
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
