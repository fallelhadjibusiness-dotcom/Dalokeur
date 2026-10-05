import type { RequestStatus } from "@prisma/client";

export const STATUS_LABELS: Record<RequestStatus, string> = {
  NEW: "Nouvelle demande",
  PENDING: "En attente",
  ASSIGNED: "Prestataire affecté",
  ACCEPTED: "Acceptée",
  EN_ROUTE: "En route",
  ARRIVED: "Arrivé",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

export const TERMINAL_STATUSES: RequestStatus[] = ["COMPLETED", "CANCELLED"];

// Transitions autorisées (machine à états unique, testée).
const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  NEW: ["PENDING", "ASSIGNED", "CANCELLED"],
  PENDING: ["ASSIGNED", "ACCEPTED", "CANCELLED"],
  ASSIGNED: ["ACCEPTED", "PENDING", "CANCELLED"],
  ACCEPTED: ["EN_ROUTE", "ARRIVED", "CANCELLED"],
  EN_ROUTE: ["ARRIVED", "CANCELLED"],
  ARRIVED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// Statuts avant acceptation : le prestataire ne voit que les infos floutées.
export const PRE_ACCEPTANCE: RequestStatus[] = ["NEW", "PENDING", "ASSIGNED"];

export function isLocationSharingAllowed(status: RequestStatus): boolean {
  return ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(status);
}
