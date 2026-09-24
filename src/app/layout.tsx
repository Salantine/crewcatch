import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/* Archivo: grotesque, industrial, wide. Rejected Inter/Roboto — the width is
 * what carries the "specialized equipment" tone rather than a consumer app. */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

/* JetBrains Mono for metrics, IDs, timestamps — the data-density signal. */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CrewCatch AI — Never lose a call to voicemail",
    template: "%s | CrewCatch AI",
  },
  description:
    "Voice automation for North American contractors. Capture missed, after-hours, and overflow calls and dispatch qualified leads in under 30 seconds.",
};

export const viewport: Viewport = {
  themeColor: "#0a1628",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
