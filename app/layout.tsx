import type { Metadata } from "next";
import { Great_Vibes, Inter } from "next/font/google";
import "./globals.css";

const signature = Great_Vibes({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-signature",
});

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Orçamento Preliminar IFC — by Kevin Quintian",
  description:
    "Importe um arquivo IFC (BIM) e baixe a planilha de orçamento preliminar.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${signature.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-neutral-50 font-[family-name:var(--font-sans)] text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
