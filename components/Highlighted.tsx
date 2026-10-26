import type { ReactNode } from "react";
import type { Range } from "@/lib/highlight";

export const TYPE_STYLE: Record<string, string> = {
  PERSON: "bg-sky-400/20 text-sky-200 ring-sky-400/40",
  SSN: "bg-rose-400/20 text-rose-200 ring-rose-400/40",
  EMAIL: "bg-violet-400/20 text-violet-200 ring-violet-400/40",
  PHONE: "bg-emerald-400/20 text-emerald-200 ring-emerald-400/40",
  ADDRESS: "bg-amber-400/20 text-amber-200 ring-amber-400/40",
  IBAN: "bg-fuchsia-400/20 text-fuchsia-200 ring-fuchsia-400/40",
  CARD: "bg-orange-400/20 text-orange-200 ring-orange-400/40",
  DATE: "bg-teal-400/20 text-teal-200 ring-teal-400/40",
  ID: "bg-lime-400/20 text-lime-200 ring-lime-400/40",
};
const FALLBACK = "bg-slate-400/20 text-slate-200 ring-slate-400/40";

export const styleFor = (type: string) => TYPE_STYLE[type] ?? FALLBACK;

/** Renders text with the given (non-overlapping, sorted) ranges wrapped in <mark>. */
export function Highlighted({ text, ranges }: { text: string; ranges: Range[] }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start < cursor || r.end > text.length) return;
    if (r.start > cursor) parts.push(text.slice(cursor, r.start));
    parts.push(
      <mark
        key={i}
        title={`${r.type}: ${r.placeholder}`}
        className={`rounded px-0.5 ring-1 ring-inset ${styleFor(r.type)}`}
      >
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
