# Dalokeur — Tous vos services, une seule maison

Plateforme web mobile-first de services à domicile et de proximité à **Dakar et Pikine** : ménage et lessive, dépannage (plomberie, électricité, climatisation, serrurerie), livraison locale, et agence immobilière. Prestataires vérifiés à la main, parcours de commande simple, interface en français.

**Stack** : Next.js 15 (App Router) · TypeScript · Tailwind · PostgreSQL · Prisma · Auth.js · MapLibre · Vitest · Playwright. Déploiement prévu : Vercel + Neon + Cloudflare R2 (voir [DEPLOY.md](DEPLOY.md)). Sécurité : voir [SECURITY.md](SECURITY.md).

## Démarrer en local
```bash
cp .env.example .env            # DATABASE_URL, DIRECT_URL, AUTH_SECRET (openssl rand -base64 32)
npm install
npx prisma migrate deploy
ADMIN_SEED_PASSWORD='…' npm run db:seed
npm run dev
```
Comptes de démonstration (mot de passe `Dalokeur2026!`, ou `DEMO_PASSWORD`) : clients `+221772000001/2`, prestataires `+221771000001…5` (le 5e est en attente de validation). L'administrateur n'est créé que si `ADMIN_SEED_PASSWORD` est défini (téléphone `ADMIN_SEED_PHONE`, défaut `+221770000000`).

## Ce que fait chaque rôle
| Rôle | Fonctions |
|---|---|
| **Client** | Recherche, demande de service (urgent ou créneau, quartier + adresse + point de repère, photos, position GPS facultative), suivi par statuts, messagerie, annulation, avis unique, historique, reçu démo, portefeuille démo, points Keur, notifications, agence immobilière (annonces, demande de visite) |
| **Prestataire** | Inscription avec validation manuelle, tableau de bord, missions (5 onglets), accepter/refuser, statuts, partage de position avec consentement, agenda, messagerie, gains démo, profil (photo, documents de vérification visibles par l'admin seul) |
| **Administrateur** | Indicateurs, validation/refus/suspension des prestataires et de leurs documents, affectation manuelle, demandes (filtres statut/service/zone/date), comptes, avis, litiges, services et catégories, commission, zones, points Keur, annonces et visites immobilières, journal d'audit, **double authentification** |

## Règles métier clés
- Un prestataire non vérifié ne peut pas accepter ; une demande n'est visible que dans sa zone et son métier.
- **Avant acceptation** : le prestataire ne voit que service, quartier, zone approximative (~500 m), créneau, description et prix. Adresse exacte, téléphone, GPS précis et photos arrivent **après acceptation** et sont retirés si la mission est annulée.
- Annulation libre avant acceptation ; motif obligatoire après. Un avis par mission terminée.
- **Position en direct** : livraison et dépannage urgent seulement, consentement explicite du prestataire, visible du client de la mission uniquement, ~15 s, arrêt automatique (fin, annulation, expiration), purge à 24 h.
- **Points Keur** : 1 point = 10 FCFA de réduction sur les seuls frais de transport/livraison ; jamais convertibles en argent ; remboursés à l'annulation et à l'expiration ; aucun bonus à l'inscription. Le portefeuille FCFA est fictif : **aucun paiement réel**.
- Immobilier : l'adresse exacte d'un bien n'est révélée qu'au client dont la visite est confirmée par l'agence.

## Organisation du code
`src/lib/*.ts` = logique métier et règles d'accès (testées) · `src/app/**` = pages, actions serveur, routes API · `src/components/**` = interface · `prisma/` = schéma, migrations, seed · `tests/` = unitaires, intégration (PostgreSQL), e2e mobile.

## Tests
```bash
npm test                         # unitaires + intégration (PostgreSQL requis) + garde-fous de sécurité
npm run build && npm run test:e2e   # parcours mobiles, accessibilité (axe), PWA, performance 3G
npm run lint && npm run typecheck
```
La CI GitHub Actions (`.github/workflows/ci.yml`) exécute tout cela sur une base PostgreSQL jetable.

## Choix techniques à connaître
- **Temps réel par polling** (messages 5 s, position 10 s) : simple et fiable avec Vercel ; un service temps réel pourra être ajouté sans changer les règles d'accès.
- **Carte** : MapLibre + fournisseur de tuiles configurable (`NEXT_PUBLIC_MAP_STYLE_URL`/`KEY`, ex. MapTiler ou Protomaps) ; repli OpenStreetMap pour le développement seulement. Clé publique : restreignez-la par domaine.
- **Fichiers** : pilote `local` (dev/tests) ou `s3` (R2, production) ; type vérifié par signature, EXIF supprimé, lecture contrôlée par `/api/files`.
- **Application installable** (manifeste + service worker) : aucun contenu privé n'est mis en cache.
- Suivi de position limité à l'application ouverte (pas d'arrière-plan) ; arrivée estimée indicative.

## Pas encore fait (feuille de route)
Vrais paiements (Wave, Orange Money), connexion/récupération par OTP SMS, wolof, pièces jointes dans la messagerie, notifications push/SMS, location de véhicules et gestion locative (prévues en base, sans écrans), suppression de compte en libre-service, rémunération réelle des prestataires.
