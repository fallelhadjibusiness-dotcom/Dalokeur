# Déploiement de Dalokeur (Vercel + Neon + Cloudflare R2)

Ce guide met l'application en ligne. Aucune étape ne nécessite de modifier le code.

## 1. Base de données (Neon)
1. Créez un projet sur neon.tech (région la plus proche : Europe/Frankfurt). PostgreSQL 16.
2. Récupérez **deux** URLs : la connexion *poolée* (`DATABASE_URL`) et la connexion *directe* (`DIRECT_URL`, pour les migrations). Ajoutez `?sslmode=require`.

## 2. Fichiers (Cloudflare R2)
Sur Vercel le disque est éphémère : `STORAGE_DRIVER=s3` est obligatoire.
1. Créez un bucket **privé** (jamais d'accès public : les fichiers sont servis par l'application après contrôle d'accès).
2. Créez un jeton d'accès API (lecture/écriture sur ce bucket) → `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
3. `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_BUCKET=<nom>`.
> Le pilote S3 n'a pas pu être testé contre un vrai bucket dans l'environnement de développement (seul le pilote local l'a été). Faites un test d'envoi de photo juste après le premier déploiement.

## 3. Carte
Créez une clé MapTiler (offre gratuite, vérifiez le quota et les conditions commerciales) et **restreignez-la à votre domaine**.
`NEXT_PUBLIC_MAP_STYLE_URL=https://api.maptiler.com/maps/streets-v2/style.json`, `NEXT_PUBLIC_MAP_KEY=<clé>`.
Alternative sans clé : Protomaps (PMTiles) hébergé sur R2 ; ajoutez les origines utilisées par le style dans `MAP_CSP_ORIGINS`.

## 4. Variables d'environnement Vercel (Production)
| Variable | Valeur |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Neon (étape 1) |
| `AUTH_SECRET` | `openssl rand -base64 32` — **ne jamais changer ensuite** (invalide les sessions et les secrets 2FA, sauf si `TOTP_ENCRYPTION_KEY` est défini) |
| `AUTH_URL` | `https://votre-domaine` |
| `CRON_SECRET` | `openssl rand -hex 32` (Vercel l'envoie au cron) |
| `STORAGE_DRIVER=s3`, `S3_*` | étape 2 |
| `NEXT_PUBLIC_MAP_STYLE_URL`, `NEXT_PUBLIC_MAP_KEY` | étape 3 |
| `REQUIRE_ADMIN_2FA=true` | double authentification obligatoire pour l'administration |
| `TOTP_ENCRYPTION_KEY` | facultatif ; `openssl rand -base64 32` |

## 5. Déploiement
1. Importez le dépôt dans Vercel. Framework : Next.js. **Build Command : `npm run vercel-build`** (applique les migrations puis construit).
2. **Données de départ sans ordinateur** : ajoutez les variables `RUN_SEED=1`, `ADMIN_SEED_PASSWORD`, `ADMIN_SEED_PHONE` et `DEMO_PASSWORD` avant le premier déploiement ; le build crée alors services, quartiers, annonces, comptes de démonstration et administrateur (`scripts/maybe-seed.mjs`, idempotent). Après le premier déploiement réussi, **supprimez `RUN_SEED`** (et `DEMO_PASSWORD` si vous retirez les comptes de démonstration). Alternative depuis votre poste :
   ```bash
   DATABASE_URL="<url directe>" DIRECT_URL="<url directe>" ADMIN_SEED_PHONE="+221…" ADMIN_SEED_EMAIL="…" ADMIN_SEED_PASSWORD="<mot de passe fort>" npm run db:seed
   ```
   Le seed ajoute aussi des données de démonstration (Dakar/Pikine) : **n'exécutez pas le seed complet en production réelle** ou supprimez ensuite les comptes de démonstration (`+22177100000x`, `+22177200000x`) depuis l'administration.
3. Connectez-vous à `/admin`, ouvrez **Sécurité** et activez la double authentification. Conservez les codes de secours hors ligne.
4. Domaine personnalisé : Vercel fournit HTTPS automatiquement (nécessaire au GPS).
5. Le cron quotidien (`vercel.json`) purge les trajets, les fichiers orphelins, les limites expirées et expire les demandes sans prestataire. Sur l'offre gratuite, il ne tourne qu'une fois par jour : l'expiration des demandes est aussi appliquée à la consultation.

> **Piège Vercel** : le bouton « Redeploy » reconstruit **le même commit**. Après une correction du code, attendez le déploiement automatique créé par le `git push` (onglet Deployments, vérifiez le message du commit) au lieu de cliquer sur Redeploy.

## 6. Après la mise en ligne
- Testez : inscription client, demande avec photo, acceptation par un prestataire, messagerie, position en direct (sur un vrai téléphone, en HTTPS), connexion admin avec code 2FA.
- Surveillance : activez les alertes d'erreurs Vercel ; ajoutez Sentry si besoin (aucune donnée personnelle dans les journaux applicatifs).
- Sauvegardes : activez la restauration à un instant donné chez Neon.
- Paiements : toujours en démonstration. Wave et Orange Money nécessitent un contrat marchand et une intégration dédiée.

## Développement local
```bash
cp .env.example .env     # DATABASE_URL, AUTH_SECRET…
npm install && npx prisma migrate deploy && npm run db:seed && npm run dev
npm test                 # unitaires + intégration (PostgreSQL requis)
npm run build && npm run test:e2e
```
