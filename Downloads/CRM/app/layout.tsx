import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { LanguageProvider } from "@/components/i18n";

export const metadata: Metadata = {
  title: "Vendora Nordic CRM",
  description: "CRM för kunder, kontakter och planer med Railway + PostgreSQL"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <head>
        <link rel="stylesheet" href="/vendora-common.css" />
      </head>
      <body>
        <LanguageProvider>
          <div className="crm-shell">
            <Header />
            <main className="crm-main">{children}</main>
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
