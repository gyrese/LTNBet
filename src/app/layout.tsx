import type { Metadata } from "next";
import { Anybody, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import AppProvider from "@/components/AppProvider";
import "./globals.css";

const anybody = Anybody({
  variable: "--font-anybody",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Les Toiles Noires Predictor",
  description:
    "Application de pronostics sportifs en temps réel pour l'animation des matchs de l'équipe de France aux Toiles Noires.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${anybody.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* Material Symbols Outlined stylesheet */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-full bg-surface-container-lowest text-on-surface flex flex-col antialiased"
      >
        {/* Premium app-wide cinematic backdrop (fixed, behind everything) */}
        <div className="app-backdrop" aria-hidden="true" />
        <div className="app-grain" aria-hidden="true" />
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
