# Sécurité — état des lieux

## Mesures en place
- **Authentification** : mots de passe hachés (bcrypt, coût 12), politique anti-mots de passe triviaux, sessions JWT 7 jours, rôle **revérifié en base** à chaque page et action sensible.
- **Double authentification (TOTP)** pour les administrateurs : secret chiffré au repos (AES-256-GCM), anti-rejeu, codes de secours à usage unique, obligatoire via `REQUIRE_ADMIN_2FA=true`.
- **Autorisation** : middleware par rôle, `requireRole` dans chaque page et action, `assertAdmin` dans toute la couche d'administration, accès aux données par propriétaire. Un test d'analyse statique vérifie que **chaque action serveur et route API** exige une identité.
- **Données privées** : adresse exacte, téléphone, GPS, photos de demande et documents jamais exposés avant acceptation/validation (DTO + tests d'intégration). Documents de vérification lisibles par l'administrateur seul.
- **Position** : consentement explicite, partage limité à la mission, arrêt automatique, purge à 24 h.
- **Fichiers** : type vérifié par signature (pas par nom), 4 Mo max, métadonnées EXIF/GPS supprimées, noms aléatoires, bucket privé, lecture par `/api/files` avec en-têtes `nosniff` + CSP `sandbox`, requêtes d'envoi limitées au même site (Origin).
- **Limites de tentatives** partagées en base (connexion, inscription, messages, visites, fichiers, 2FA).
- **En-têtes** : CSP, HSTS, `X-Frame-Options: DENY`, `Permissions-Policy`, `nosniff`, COOP.
- **Journal d'audit** de toutes les actions d'administration ; erreurs génériques côté utilisateur.

## Limites connues (à connaître avant le lancement)
1. **CSP avec `'unsafe-inline'` pour les scripts** : exigé par les scripts intégrés de Next.js sans nonce. Les origines restent restreintes.
2. **Verrouillage par numéro** : 10 tentatives de connexion par 15 min et par numéro ; un tiers peut donc temporairement empêcher une connexion en saturant ce compteur. Compromis volontaire contre la force brute.
3. **Dépendances (`npm audit`)** : 5 alertes, toutes dans des **outils de build** (postcss embarqué par Next.js, `deepmerge-ts` dans la CLI Prisma), non exécutés pour servir les requêtes. Correctif : Next.js 16 / Prisma 7 (changements majeurs) — à planifier après le lancement.
4. **Pas de réinitialisation de mot de passe en libre-service** (aucun SMS/e-mail payant branché) : à gérer par l'assistance. À ajouter avec le fournisseur d'OTP SMS.
5. **Pilote S3/R2 non testé sur un vrai bucket** ici ; test d'envoi à faire au premier déploiement.
6. **Suivi de position** limité à l'application ouverte (pas d'arrière-plan).
7. **Paiements** : démonstration uniquement.
8. **Conformité** : la page de confidentialité décrit les traitements réels mais doit être relue par un juriste (loi sénégalaise n° 2008-12 sur les données personnelles, déclaration à la CDP).

## Signaler une vulnérabilité
Écrivez à l'administrateur de la plateforme ; ne publiez pas les détails avant correction.
