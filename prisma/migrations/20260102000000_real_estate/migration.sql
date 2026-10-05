-- Immobilier : caractéristiques des annonces et suivi des demandes de visite.
ALTER TABLE "properties" ADD COLUMN "bedrooms" INTEGER;
ALTER TABLE "properties" ADD COLUMN "surface_m2" INTEGER;
ALTER TABLE "properties" ADD CONSTRAINT "properties_price_positive" CHECK ("price_fcfa" > 0);

ALTER TABLE "property_visits" ADD COLUMN "preferred_at" TIMESTAMP(3);
ALTER TABLE "property_visits" ADD COLUMN "message" TEXT;
ALTER TABLE "property_visits" ADD COLUMN "agency_note" TEXT;
ALTER TABLE "property_visits" ADD COLUMN "cancel_reason" TEXT;
ALTER TABLE "property_visits" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "property_visits_client_id_idx" ON "property_visits"("client_id");
-- Une seule demande de visite active par client et par bien.
CREATE UNIQUE INDEX "one_active_visit_per_client_property" ON "property_visits"("property_id", "client_id") WHERE "status" IN ('REQUESTED', 'CONFIRMED');

-- Module retiré du produit : gestion de boutiques.
DELETE FROM "service_categories" WHERE "slug" = 'gestion-boutiques';
