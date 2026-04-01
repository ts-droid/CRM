"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n";

type NavProps = {
  isAdmin: boolean;
};

export function Nav({ isAdmin: _isAdmin }: NavProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const links = [
    { href: "/", key: "navOverview" as const },
  ];

  return (
    <nav className="vendora-nav" aria-label="Main navigation">
      {links.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link key={link.href} href={link.href} className={isActive ? "active" : ""}>
            {t(link.key)}
          </Link>
        );
      })}
    </nav>
  );
}
