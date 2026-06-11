import type { Metadata } from "next";
import { Bebas_Neue, DM_Sans, JetBrains_Mono } from "next/font/google";
import AppProvider from "@/components/AppProvider";
import "./globals.css";

/* Bebas Neue — display/score/headline font (all-caps, ultra-bold feel) */
const bebasNeue = Bebas_Neue({
  variable: "--font-anybody",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

/* DM Sans — clean modern body/UI font */
const dmSans = DM_Sans({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

/* JetBrains Mono — odds, data, timestamps */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LTNBet · Live Predictor",
  description:
    "Application de pronostics sportifs en temps réel pour l'animation des matchs aux Toiles Noires.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${bebasNeue.variable} ${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-full bg-surface-container-lowest text-on-surface flex flex-col antialiased"
      >
        <div className="app-backdrop" aria-hidden="true" />
        <div className="app-grain" aria-hidden="true" />
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
