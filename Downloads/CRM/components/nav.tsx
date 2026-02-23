"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Översikt" },
  { href: "/customers", label: "Kunder" },
  { href: "/contacts", label: "Kontakter" },
  { href: "/plans", label: "Planer" }
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="crm-nav" aria-label="Huvudnavigation">
      {LINKS.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link key={link.href} href={link.href} className={`crm-nav-link${isActive ? " active" : ""}`}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
