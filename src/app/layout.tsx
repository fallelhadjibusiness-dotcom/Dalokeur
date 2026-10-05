import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });

export const metadata: Metadata = {
  title: "Dalokeur — Tous vos services, une seule maison",
  description: "Ménage, dépannage à domicile et livraison à Dakar et Pikine, avec des prestataires vérifiés.",
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Dalokeur", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#0f6b4d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={nunito.variable}>
      <body>{children}<RegisterSW /></body>
    </html>
  );
}
