import { extractText, getDocumentProxy } from "unpdf";
import { redact } from "@/lib/redact";
import { chunk } from "@/lib/chunk";
export const maxDuration = 60;
const MAX_BYTES = 4 * 1024 * 1024;

// Accepts multipart form-data with a "file" field (.txt or .pdf),
// or JSON: { text, name } (used by "Load sample document").
// Raw text is processed in memory only. It is never stored or logged.
export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  let text = "";
  let name = "document";

  try {
    if (ct.includes("application/json")) {
      const b = await req.json();
      text = String(b.text ?? "");
      name = String(b.name ?? name);
    } else {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return Response.json({ error: "No file uploaded" }, { status: 400 });
      // The browser checks this too; enforce it here so the limit cannot be bypassed.
      if (file.size > MAX_BYTES) return Response.json({ error: "This file is larger than 4 MB." }, { status: 413 });
      name = file.name;
      const buf = new Uint8Array(await file.arrayBuffer());
      if (name.toLowerCase().endsWith(".pdf")) {
        const pdf = await getDocumentProxy(buf);
        const r = await extractText(pdf, { mergePages: true });
        text = Array.isArray(r.text) ? r.text.join("\n\n") : r.text;
      } else {
        text = new TextDecoder().decode(buf);
      }
    }
  } catch {
    return Response.json({ error: "Could not read the file" }, { status: 400 });
  }

  if (!text.trim()) {
    return Response.json({ error: "No text found (scanned PDFs are not supported)" }, { status: 422 });
  }

  const docId = "doc_" + crypto.randomUUID().slice(0, 8);
  const { redactedText, entities } = redact(text);
  const chunks = chunk(redactedText).map((t, i) => ({ id: `${docId}_c${i + 1}`, docId, text: t }));
  return Response.json({ docId, name, originalText: text, redactedText, entities, chunks });
}
