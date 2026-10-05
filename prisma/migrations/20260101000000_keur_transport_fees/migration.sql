-- Frais de transport/livraison par service, copiés sur la demande avec la réduction Keur appliquée.
ALTER TABLE "services" ADD COLUMN "transport_fee_fcfa" INTEGER;
ALTER TABLE "service_requests" ADD COLUMN "transport_fee_fcfa" INTEGER;
ALTER TABLE "service_requests" ADD COLUMN "keur_discount_fcfa" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "service_requests" ADD CONSTRAINT "keur_discount_non_negative" CHECK ("keur_discount_fcfa" >= 0 AND "keur_points_used" >= 0);
