// Règles d'autorisation centralisées. Fonctions pures : testées sans base de données.
import type { ProviderStatus, RequestStatus, Role } from "@prisma/client";
import { PRE_ACCEPTANCE } from "./status";

export type Actor = { id: string; role: Role };

export function canProviderAccept(status: ProviderStatus, available: boolean): boolean {
  return status === "VERIFIED" && available;
}

type ProviderScope = { status: ProviderStatus; zones: string[]; serviceIds: string[] };
type RequestScope = { zone: string; serviceId: string; status: RequestStatus };

// Une demande n'est visible que dans une zone ET un métier compatibles, tant qu'elle est ouverte.
export function isRequestVisibleToProvider(p: ProviderScope, r: RequestScope): boolean {
  if (p.status !== "VERIFIED") return false;
  if (!PRE_ACCEPTANCE.includes(r.status)) return false;
  return p.zones.includes(r.zone) && p.serviceIds.includes(r.serviceId);
}

type AssignmentScope = { providerUserId: string; status: "OFFERED" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED" };

// Adresse exacte, téléphone, GPS précis : client propriétaire, prestataire ayant ACCEPTÉ, admin.
export function canSeePrivateDetails(
  actor: Actor,
  request: { clientId: string },
  assignment: AssignmentScope | null,
): boolean {
  if (actor.role === "ADMIN") return true;
  if (actor.role === "CLIENT") return actor.id === request.clientId;
  if (actor.role === "PROVIDER") {
    return !!assignment && assignment.providerUserId === actor.id && assignment.status === "ACCEPTED";
  }
  return false;
}

// Messagerie : client de la mission, prestataire assigné (accepté), admin.
export function canUseChat(
  actor: Actor,
  request: { clientId: string },
  assignment: AssignmentScope | null,
): boolean {
  return canSeePrivateDetails(actor, request, assignment);
}

export type CancelDecision =
  | { allowed: true; reasonRequired: boolean }
  | { allowed: false; message: string };

// Avant acceptation : sans conséquence. Après : motif obligatoire.
export function cancelPolicy(status: RequestStatus): CancelDecision {
  if (status === "COMPLETED" || status === "CANCELLED") {
    return { allowed: false, message: "Cette demande est déjà clôturée." };
  }
  return { allowed: true, reasonRequired: !PRE_ACCEPTANCE.includes(status) };
}

export function canReview(
  actor: Actor,
  request: { clientId: string; status: RequestStatus },
  alreadyReviewed: boolean,
): { allowed: boolean; message?: string } {
  if (actor.role !== "CLIENT" || actor.id !== request.clientId) return { allowed: false, message: "Accès refusé." };
  if (request.status !== "COMPLETED") return { allowed: false, message: "La mission n'est pas terminée." };
  if (alreadyReviewed) return { allowed: false, message: "Vous avez déjà donné votre avis." };
  return { allowed: true };
}

export function homePathForRole(role: Role): string {
  return role === "ADMIN" ? "/admin" : role === "PROVIDER" ? "/prestataire" : "/client";
}

const ROLE_PREFIX: Array<[string, Role]> = [
  ["/admin", "ADMIN"],
  ["/prestataire", "PROVIDER"],
  ["/client", "CLIENT"],
];

// Utilisé par le middleware : rôle requis pour un chemin, ou null si public.
export function requiredRoleForPath(pathname: string): Role | null {
  for (const [prefix, role] of ROLE_PREFIX) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return role;
  }
  return null;
}
