"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n";

const LINKS = [
  { href: "/", key: "navOverview" },
  { href: "/customers", key: "navCustomers" },
  { href: "/contacts", key: "navContacts" },
  { href: "/plans", key: "navPlans" }
] as const;

export function Nav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="crm-nav" aria-label="Main navigation">
      {LINKS.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link key={link.href} href={link.href} className={`crm-nav-link${isActive ? " active" : ""}`}>
            {t(link.key)}
          </Link>
        );
      })}
    </nav>
  );
}
