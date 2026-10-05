import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export const metadata = { title: "Confidentialité — Dalokeur" };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="text-lg font-extrabold text-emerald-800">{title}</h2>
    <div className="space-y-2 text-ink">{children}</div>
  </section>
);

// Texte descriptif des traitements réels de l'application. Il doit être relu par un juriste avant la mise en ligne
// (loi sénégalaise n° 2008-12 sur la protection des données à caractère personnel, déclaration à la CDP).
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-6">
      <Link href="/" aria-label="Accueil"><Logo /></Link>
      <h1 className="text-2xl font-extrabold text-emerald-800">Confidentialité et données personnelles</h1>
      <p className="text-ink-soft">Dalokeur ne collecte que ce qui est nécessaire pour vous mettre en relation avec un prestataire vérifié. Voici ce que nous faisons de vos données, en termes simples.</p>

      <Section title="Ce que nous collectons">
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Compte</b> : nom, numéro de téléphone, mot de passe (stocké chiffré, jamais lisible).</li>
          <li><b>Demandes</b> : service demandé, description, quartier, adresse, point de repère, photos que vous ajoutez, messages échangés avec le prestataire, avis.</li>
          <li><b>Prestataires</b> : métier, zones, expérience, photo de profil et documents de vérification.</li>
          <li><b>Portefeuille et points Keur</b> : en mode démonstration, aucun paiement réel n'est traité.</li>
        </ul>
      </Section>

      <Section title="Votre position">
        <ul className="list-disc space-y-1 pl-5">
          <li>Le GPS n'est demandé que lorsque vous appuyez sur « Utiliser ma position ». Vous pouvez toujours saisir votre adresse à la main.</li>
          <li>Avant qu'un prestataire accepte votre demande, il ne voit qu'une <b>zone approximative</b> (environ 500 m), jamais votre adresse exacte ni votre téléphone.</li>
          <li>Pour une livraison ou un dépannage urgent, le <b>prestataire</b> peut partager sa position en direct avec vous, <b>après son consentement explicite</b>. Elle n'est visible que par vous, uniquement pendant la mission, et s'arrête automatiquement à la fin, à l'annulation ou à l'expiration.</li>
          <li>Les données de trajet sont <b>supprimées 24 heures</b> après la fin de la mission.</li>
        </ul>
      </Section>

      <Section title="Qui voit quoi">
        <ul className="list-disc space-y-1 pl-5">
          <li>Le prestataire qui accepte votre demande voit votre adresse, votre téléphone et vos photos. Ces informations sont retirées de son accès si la mission est annulée.</li>
          <li>Les documents de vérification des prestataires ne sont visibles que par l'administration de Dalokeur.</li>
          <li>L'administration peut consulter les demandes et les conversations pour traiter un litige ou un signalement ; chacune de ses actions est enregistrée.</li>
          <li>Nous ne vendons pas vos données et n'affichons pas de publicité.</li>
        </ul>
      </Section>

      <Section title="Photos et fichiers">
        <p>Les données de localisation intégrées aux photos (EXIF) sont supprimées avant l'enregistrement. Les fichiers sont stockés de façon privée et ne sont accessibles qu'aux personnes autorisées ci-dessus.</p>
      </Section>

      <Section title="Sécurité">
        <p>Connexion chiffrée (HTTPS), mots de passe protégés, double authentification pour l'administration, journal des actions d'administration, limitation des tentatives de connexion.</p>
      </Section>

      <Section title="Vos droits">
        <p>Vous pouvez demander l'accès à vos données, leur correction ou leur suppression en contactant l'assistance Dalokeur. Nous répondons dans un délai raisonnable. Vous pouvez aussi vous adresser à la Commission de Protection des Données Personnelles (CDP) du Sénégal.</p>
      </Section>

      <p className="rounded-xl2 bg-cream-100 p-3 text-sm text-ink-soft">Version de démonstration : ce texte décrit le fonctionnement actuel de l'application et sera finalisé avec un conseil juridique avant l'ouverture au public.</p>
      <Link href="/" className="inline-flex min-h-12 items-center rounded-xl2 border-2 border-emerald-600 px-5 font-bold text-emerald-700">Retour à l'accueil</Link>
    </main>
  );
}
