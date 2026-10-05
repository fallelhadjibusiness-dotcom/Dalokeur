// DTO par rôle : le prestataire ne reçoit JAMAIS les champs privés avant acceptation.
// Toute lecture de demande pour un prestataire passe par ces fonctions.
import type { PriceMode, RequestMode, RequestStatus } from "@prisma/client";

type RequestRow = {
  id: string;
  reference: string;
  mode: RequestMode;
  description: string;
  zone: string;
  scheduledAt: Date | null;
  priceMode: PriceMode;
  estimateFcfa: number | null;
  status: RequestStatus;
  service: { name: string };
  location: {
    district: string;
    addressLine: string;
    landmark: string;
    lat: number | null;
    lng: number | null;
    approxLat: number | null;
    approxLng: number | null;
  };
  client: { fullName: string; phone: string };
};

export type ProviderRequestPreview = {
  id: string;
  reference: string;
  service: string;
  mode: RequestMode;
  district: string;
  zone: string;
  approx: { lat: number | null; lng: number | null };
  scheduledAt: Date | null;
  description: string;
  priceLabel: string;
  status: RequestStatus;
};

export type ProviderRequestFull = Omit<ProviderRequestPreview, "approx"> & {
  address: string;
  landmark: string;
  coords: { lat: number | null; lng: number | null };
  clientName: string;
  clientPhone: string;
};

export function priceLabel(mode: PriceMode, estimate: number | null): string {
  if (mode === "QUOTE_AFTER_DIAGNOSIS" || estimate == null) return "Devis après diagnostic";
  return `Environ ${estimate.toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;
}

export function toProviderPreview(r: RequestRow): ProviderRequestPreview {
  return {
    id: r.id,
    reference: r.reference,
    service: r.service.name,
    mode: r.mode,
    district: r.location.district,
    zone: r.zone,
    approx: { lat: r.location.approxLat, lng: r.location.approxLng },
    scheduledAt: r.scheduledAt,
    description: r.description,
    priceLabel: priceLabel(r.priceMode, r.estimateFcfa),
    status: r.status,
  };
}

// À n'appeler qu'après canSeePrivateDetails(...) === true
export function toProviderFull(r: RequestRow): ProviderRequestFull {
  const { approx: _approx, ...base } = toProviderPreview(r);
  return {
    ...base,
    address: r.location.addressLine,
    landmark: r.location.landmark,
    coords: { lat: r.location.lat, lng: r.location.lng },
    clientName: r.client.fullName,
    clientPhone: r.client.phone,
  };
}
