# Dalokeur — Tous vos services, une seule maison

Plateforme de services à domicile et de proximité, Dakar et Pikine. Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL · Auth.js · Tailwind.

## Démarrer
```bash
cp .env.example .env        # renseigner DATABASE_URL, DIRECT_URL, AUTH_SECRET (openssl rand -base64 32)
npm install
npx prisma migrate deploy   # ou: npm run db:migrate
ADMIN_SEED_PASSWORD='…' npm run db:seed
npm run dev
```
Comptes démo (seed) : mot de passe `Dalokeur2026!` (ou `DEMO_PASSWORD`) — clients `+221772000001/2`, prestataires `+221771000001…5` (le 5e est en attente de validation). L'admin n'est créé que si `ADMIN_SEED_PASSWORD` est défini.

## Tests
`npm test` (règles d'autorisation, DTO sans fuite de données privées, statuts, annulation, avis) · `npm run typecheck` · `npm run lint`

## Sécurité (étape 1)
- Middleware : `/admin`, `/prestataire`, `/client` exigent le rôle correspondant ; chaque page revérifie le rôle **en base** (`requireRole`).
- L'inscription publique ne peut créer que CLIENT ou PROVIDER (en attente) ; jamais ADMIN.
- Règles métier centralisées dans `src/lib/policies.ts` ; le prestataire ne reçoit des données privées que via `src/lib/dto.ts` après acceptation.
- En-têtes HTTPS/HSTS, `Permissions-Policy` (géolocalisation limitée à notre origine). Limiteur de tentatives en mémoire (à remplacer par Redis en production).

## Étape 2 — parcours client
Accueil (recherche, urgences, services, prestataires recommandés) · création de demande (urgente ou créneau, quartier, adresse, point de repère, estimation ou « devis après diagnostic ») · suivi par statuts · annulation (motif obligatoire après acceptation, points Keur remboursés) · confirmation de fin · avis unique · signalement · historique · reçu démo · portefeuille démo + points Keur.

Tests : `npm test` inclut des tests d'intégration sur PostgreSQL (ignorés sans `DATABASE_URL`). E2E mobile : `npm run build && npx playwright test` (définir `CHROMIUM_PATH` si besoin).
Reportés : photo de la demande (stockage à l'étape 6), messagerie (étape 5), carte (étape 6).

## Étape 3 — espace prestataire
Tableau de bord · missions (nouvelles, à venir, en cours, terminées, annulées) · accepter/refuser · statuts (en route, arrivé, démarrer, terminer) · agenda · gains démo (après commission) · profil, disponibilité et avis reçus. Logique dans `src/lib/missions.ts`.
- Non vérifié, suspendu, indisponible, hors zone ou hors métier : aucune demande visible, acceptation refusée côté serveur.
- Avant acceptation : service, quartier/zone, créneau, description, prix. Après : adresse, repère, téléphone. Après annulation : de nouveau masqués.
- Acceptation atomique : deux prestataires simultanés → un seul gagne.
Reportés : messagerie (étape 5), photo de profil et envoi de documents (stockage), « Commencer le trajet » et position en direct (étape 6).
