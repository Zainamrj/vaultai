import type { ReactNode } from "react";

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#28303B] px-6 py-16 text-center">
      <h2 className="text-base font-medium text-[#E7EAEE]">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[#8E99A8]">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
