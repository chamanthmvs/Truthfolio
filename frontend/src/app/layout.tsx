import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import BackgroundMotif from "@/components/BackgroundMotif";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Truthfolio — honest, evidence-backed fund verdicts",
  description:
    "The honest truth about your mutual funds. Continue, Stop, or Shift — every verdict computed from real data, ranked against peers, and explained in plain English.",
  icons: {
    icon: "/truthfolio-mark.svg",
    shortcut: "/truthfolio-mark.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased`}>
        <BackgroundMotif />
        {children}
      </body>
    </html>
  );
}
