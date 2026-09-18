import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DV Confirma",
  description:
    "Confirmação de pedidos por WhatsApp com agentes de IA: confirma, quebra objeção e corrige endereço antes do envio.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
