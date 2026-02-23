import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "ReDirection CRM",
  description: "CRM för kunder, kontakter och planer med Railway + PostgreSQL"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <div className="crm-shell">
          <header className="crm-header">
            <div className="crm-header-inner">
              <div className="crm-brand">
                ReDirection <span>CRM</span>
              </div>
              <Nav />
            </div>
          </header>
          <main className="crm-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
