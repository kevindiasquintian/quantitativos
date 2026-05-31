import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quantitativos — Levantamento por PDF",
  description:
    "Importe uma planta em PDF, defina premissas e baixe a planilha de quantitativos.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
