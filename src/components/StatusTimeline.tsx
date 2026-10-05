import type { RequestStatus } from "@prisma/client";
import { STATUS_LABELS } from "@/lib/status";

const STEPS: RequestStatus[] = ["NEW", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"];

export function StatusTimeline({ status }: { status: RequestStatus }) {
  if (status === "CANCELLED") return <p className="rounded-xl2 bg-red-100 p-3 font-bold text-red-700">Demande annulée</p>;
  const current = status === "PENDING" ? 0 : STEPS.indexOf(status);
  return (
    <ol aria-label="Suivi de la demande" className="space-y-1">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === current ? "step" : undefined} className={`flex items-center gap-3 rounded-xl2 px-3 py-2 ${i === current ? "bg-emerald-600 font-extrabold text-white" : i < current ? "text-emerald-700" : "text-ink-soft"}`}>
          <span aria-hidden>{i < current ? "✔" : i === current ? "●" : "○"}</span>{STATUS_LABELS[s]}
        </li>
      ))}
    </ol>
  );
}
