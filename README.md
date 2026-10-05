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

## Étape 4 — administration sécurisée
Tableau de bord (demandes, en cours, terminées, annulations, prestataires actifs, note moyenne, taux d'acceptation, volume et chiffre d'affaires estimés) · demandes avec filtres (statut, service, zone, dates, recherche) et **affectation manuelle** · validation / refus / suspension des prestataires (motif obligatoire) · comptes (désactivation) · avis (masquage, note recalculée) · litiges · services et catégories · commission et zones de couverture · journal des actions. Logique dans `src/lib/admin.ts`.
- Défense en profondeur : middleware (`/admin`), `requireRole("ADMIN")` dans chaque page et action, `assertAdmin` dans chaque fonction métier. Un compte désactivé perd l'accès.
- L'admin ne se crée jamais par l'inscription : `ADMIN_SEED_PASSWORD` + `npm run db:seed`.
- Suspension/refus : les missions non commencées retournent en file d'attente et le client est notifié.
- Les zones de couverture désactivées bloquent les nouvelles demandes.
Reportés : consultation des documents de vérification (avec l'envoi de fichiers), création de nouveaux services, 2FA admin.

## Étape 5 — messagerie et notifications
- Messagerie par mission (`src/lib/chat.ts`) : ouverte dès qu'un prestataire accepte, entre le client propriétaire et le prestataire assigné ; l'admin lit en lecture seule. Lecture seule après annulation, fermée 48 h après la fin. 1000 caractères max, 20 messages/minute, accusés « Envoyé / Lu ».
- Mise à jour par **polling toutes les 5 s** (`GET /api/requests/[id]/messages?after=…`, en pause quand l'onglet est caché, bannière « Hors connexion » et reprise automatique). Choix volontaire : simple, fiable avec Vercel et une connexion faible. Un service temps réel (Ably/Pusher) pourra être branché plus tard sans changer les règles d'accès.
- Notifications dans l'application (`src/lib/notifications.ts`) : demande acceptée, avancement, message, annulation, fin, avis, affectation, statut du compte. Cloche avec compteur, page dédiée, chacun ne lit que les siennes.
Reportés : pièces jointes dans les messages (stockage), notifications push/SMS.

## Étape 6 — géolocalisation
**Création de demande** (`LocationPicker`) : « 📍 Utiliser ma position » (le GPS n'est demandé qu'à l'appui), carte avec épingle déplaçable, précision affichée (avertissement au-delà de 100 m), quartier suggéré (modifiable), saisie manuelle toujours possible (permission refusée, GPS absent, timeout, hors connexion, hors Dakar/Pikine). Adresse + quartier + point de repère restent obligatoires.

**Position approximative** : on stocke la position exacte et une version arrondie (~500 m). Avant acceptation, le prestataire ne reçoit que la version approximative (cercle de 500 m sur la carte). Après acceptation : épingle exacte + lien d'itinéraire.

**Partage en direct** (`src/lib/tracking.ts`) :
- Éligibilité : livraison locale, et dépannage **urgent** uniquement. Ménage, lessive, dépannage programmé : pas de suivi continu (adresse sur carte + statuts).
- « Commencer le trajet » : consentement explicite (case à cocher), position envoyée toutes les 15 s, passage automatique en « en route ». Bouton « Arrêter le partage de ma position » toujours visible.
- Visible uniquement par le client de la mission et l'admin ; aucune position renvoyée hors partage actif. Cadence minimale 5 s côté serveur, zone Dakar/Pikine validée, expiration après 4 h.
- Arrêt automatique : mission terminée, confirmée par le client, annulée, prestataire retiré, expirée.
- Client : carte, dernière position connue + heure, estimation d'arrivée (indicative, vol d'oiseau à 25 km/h), mode hors connexion.
- Conservation minimale : trajets supprimés 24 h après la fin de la mission (7 jours maximum), par `GET /api/cron/purge-tracking` (Vercel Cron quotidien, protégé par `CRON_SECRET`, voir `vercel.json`).

**Carte — coûts et limites** : MapLibre GL (gratuit, open source) + fournisseur de tuiles configurable (`NEXT_PUBLIC_MAP_STYLE_URL`, `NEXT_PUBLIC_MAP_KEY`). Recommandé : MapTiler (offre gratuite à quota mensuel, vérifier les conditions commerciales) ou Protomaps/PMTiles sur Cloudflare R2 (coût très faible, sans clé). Sans configuration, repli OpenStreetMap pour le développement uniquement. La clé est publique : restreignez-la par domaine. MapLibre est chargé à la demande ; repli textuel si WebGL est indisponible. HTTPS obligatoire pour le GPS (Vercel le fournit).
Limites : le suivi fonctionne tant que l'application reste ouverte (application web, pas de suivi en arrière-plan) ; précision GPS variable en zone dense.

## Étape 7 — portefeuille démo et points Keur
- **Points Keur** (`src/lib/keur.ts`, `src/lib/pricing.ts`) : 1 point = 10 FCFA de réduction **uniquement sur les frais de transport / livraison** (dépannage : déplacement 2 000 FCFA ; livraison : 1 500 FCFA ; ménage : aucun frais, donc aucune réduction). Plafonnés aux frais et au solde, débit atomique (pas de solde négatif, même en cas de demandes simultanées). Jamais convertibles en argent, jamais mélangés au solde FCFA (deux registres distincts, aucun code ne passe de l'un à l'autre).
- **Gains** : +10 points par mission terminée, +5 par avis laissé, une seule fois par événement ; rien pour une mission annulée. Valeurs réglables par l'admin (Paramètres).
- **Remboursement** : annulation avant ou après acceptation, et **expiration automatique** des demandes sans prestataire (`src/lib/expiry.ts`, à la consultation et via le cron) : points rendus une seule fois, client notifié.
- **Aucun bonus à l'inscription** : points = 0 et solde = 0 FCFA.
- **Portefeuille démo** : monnaie fictive, recharges prédéfinies (5 000 / 10 000 / 20 000 FCFA), plafond 100 000 FCFA, historique ; Wave, Orange Money et paiement à la prestation affichés « bientôt ». Aucun paiement réel.
- Détail du prix (estimation, déplacement, points, total à régler) sur la demande, le reçu et le formulaire.
Migration : `20260101000000_keur_transport_fees` (frais de transport par service et par demande).

## Étape 8 — immobilier (et retrait du module « boutiques »)
- **Module « gestion de boutiques » retiré** du produit : catégorie supprimée du seed et de la base (migration `20260102000000_real_estate`). Restent prévus mais non promus : location de véhicules et gestion locative.
- **Annonces** (`src/lib/property.ts`) : Louer / Acheter, types appartement, villa, studio, terrain, bureau ; filtres quartier, type et budget (min/max), tri par prix ou date ; fiche avec prix, surface, chambres, description, quartier et **zone approximative** (cercle de 500 m). Accessible depuis l'accueil client (lien discret, module non promu en priorité).
- **Adresse exacte protégée** : jamais sélectionnée dans les requêtes publiques ; révélée seulement au client dont la visite est **confirmée** (ou effectuée), et à l'admin. Elle redevient masquée si la visite est annulée. Un autre client reçoit une 404.
- **Demande de visite = demande suivie** : créneau souhaité (2 h à 30 jours), une seule demande active par client et par bien, suivi Demandée → Confirmée → Effectuée / Annulée, annulation, notifications.
- **Agence (admin)** : créer/modifier/désactiver les annonces (adresse exacte saisie mais jamais publiée), confirmer une visite avec créneau et note, la marquer effectuée, l'annuler avec motif ; tout est journalisé ; compteur de visites à confirmer sur le tableau de bord.
- Photos : visuel de remplacement en attendant le stockage de fichiers.
