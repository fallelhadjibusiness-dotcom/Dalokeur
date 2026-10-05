import { describe, expect, it } from "vitest";
import {
  canProviderAccept,
  canReview,
  canSeePrivateDetails,
  cancelPolicy,
  isRequestVisibleToProvider,
  requiredRoleForPath,
} from "@/lib/policies";
import { canTransition } from "@/lib/status";
import { toProviderFull, toProviderPreview } from "@/lib/dto";
import { approximate } from "@/lib/geo";
import { normalizeSnPhone } from "@/lib/phone";

const client = { id: "c1", role: "CLIENT" as const };
const other = { id: "c2", role: "CLIENT" as const };
const provider = { id: "p1", role: "PROVIDER" as const };
const admin = { id: "a1", role: "ADMIN" as const };
const req = { clientId: "c1" };

describe("prestataire", () => {
  it("non vérifié : ne peut pas accepter", () => {
    for (const s of ["PENDING", "REJECTED", "SUSPENDED"] as const) {
      expect(canProviderAccept(s, true)).toBe(false);
    }
    expect(canProviderAccept("VERIFIED", true)).toBe(true);
    expect(canProviderAccept("VERIFIED", false)).toBe(false);
  });

  it("visibilité par zone et métier", () => {
    const p = { status: "VERIFIED" as const, zones: ["Dakar"], serviceIds: ["plomberie"] };
    const r = { zone: "Dakar", serviceId: "plomberie", status: "NEW" as const };
    expect(isRequestVisibleToProvider(p, r)).toBe(true);
    expect(isRequestVisibleToProvider(p, { ...r, zone: "Pikine" })).toBe(false);
    expect(isRequestVisibleToProvider(p, { ...r, serviceId: "menage" })).toBe(false);
    expect(isRequestVisibleToProvider({ ...p, status: "PENDING" }, r)).toBe(false);
    expect(isRequestVisibleToProvider(p, { ...r, status: "ACCEPTED" })).toBe(false);
  });
});

describe("données privées", () => {
  it("prestataire : seulement après acceptation", () => {
    const offered = { providerUserId: "p1", status: "OFFERED" as const };
    const accepted = { providerUserId: "p1", status: "ACCEPTED" as const };
    expect(canSeePrivateDetails(provider, req, null)).toBe(false);
    expect(canSeePrivateDetails(provider, req, offered)).toBe(false);
    expect(canSeePrivateDetails(provider, req, accepted)).toBe(true);
    expect(canSeePrivateDetails({ id: "p2", role: "PROVIDER" }, req, accepted)).toBe(false);
  });
  it("client : seulement le propriétaire ; admin : toujours", () => {
    expect(canSeePrivateDetails(client, req, null)).toBe(true);
    expect(canSeePrivateDetails(other, req, null)).toBe(false);
    expect(canSeePrivateDetails(admin, req, null)).toBe(true);
  });
  const row = {
    id: "r1", reference: "DK-1001", mode: "URGENT" as const, description: "Fuite sous l'évier",
    zone: "Dakar", scheduledAt: null, priceMode: "QUOTE_AFTER_DIAGNOSIS" as const, estimateFcfa: null,
    status: "NEW" as const, service: { name: "Plomberie" },
    location: { district: "Médina", addressLine: "12 rue 11", landmark: "porte bleue", lat: 14.6937, lng: -17.4441, approxLat: 14.695, approxLng: -17.445 },
    client: { fullName: "Awa Diop", phone: "+221771234567" },
  };
  it("l'aperçu prestataire ne contient aucun champ privé", () => {
    const json = JSON.stringify(toProviderPreview(row));
    expect(json).not.toContain("12 rue 11");
    expect(json).not.toContain("+221771234567");
    expect(json).not.toContain("14.6937");
    expect(json).not.toContain("porte bleue");
    expect(json).toContain("Devis après diagnostic");
  });
  it("la vue complète révèle les infos", () => {
    const full = toProviderFull(row);
    expect(full.clientPhone).toBe("+221771234567");
    expect(full.address).toBe("12 rue 11");
  });
  it("coordonnées approximatives (~500 m)", () => {
    expect(Math.abs(approximate(14.6937) - 14.6937)).toBeLessThan(0.003);
  });
});

describe("annulation, avis, statuts", () => {
  it("avant acceptation : sans motif ; après : motif obligatoire", () => {
    expect(cancelPolicy("NEW")).toEqual({ allowed: true, reasonRequired: false });
    expect(cancelPolicy("ASSIGNED")).toEqual({ allowed: true, reasonRequired: false });
    expect(cancelPolicy("ACCEPTED")).toEqual({ allowed: true, reasonRequired: true });
    expect(cancelPolicy("IN_PROGRESS")).toEqual({ allowed: true, reasonRequired: true });
    expect(cancelPolicy("COMPLETED").allowed).toBe(false);
  });
  it("un seul avis, mission terminée, client propriétaire", () => {
    expect(canReview(client, { clientId: "c1", status: "COMPLETED" }, false).allowed).toBe(true);
    expect(canReview(client, { clientId: "c1", status: "COMPLETED" }, true).allowed).toBe(false);
    expect(canReview(client, { clientId: "c1", status: "IN_PROGRESS" }, false).allowed).toBe(false);
    expect(canReview(other, { clientId: "c1", status: "COMPLETED" }, false).allowed).toBe(false);
  });
  it("machine à états", () => {
    expect(canTransition("ACCEPTED", "EN_ROUTE")).toBe(true);
    expect(canTransition("NEW", "IN_PROGRESS")).toBe(false);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
  });
});

describe("routes et téléphone", () => {
  it("rôle requis par chemin", () => {
    expect(requiredRoleForPath("/admin")).toBe("ADMIN");
    expect(requiredRoleForPath("/admin/prestataires")).toBe("ADMIN");
    expect(requiredRoleForPath("/prestataire/missions")).toBe("PROVIDER");
    expect(requiredRoleForPath("/client")).toBe("CLIENT");
    expect(requiredRoleForPath("/administration")).toBeNull();
    expect(requiredRoleForPath("/")).toBeNull();
  });
  it("téléphone sénégalais", () => {
    expect(normalizeSnPhone("77 123 45 67")).toBe("+221771234567");
    expect(normalizeSnPhone("+221 78 123 45 67")).toBe("+221781234567");
    expect(normalizeSnPhone("12345")).toBeNull();
    expect(normalizeSnPhone("661234567")).toBeNull();
  });
});
