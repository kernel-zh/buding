"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApiKeyMenu } from "./api-key-menu";

const links = [
  { href: "/", label: "Patchsets" },
  { href: "/review", label: "Needs review" },
  { href: "/messages", label: "Messages" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="Buding home">
          <span className="brand-mark" aria-hidden="true">🍮</span>
          <span className="brand-name"><strong>布丁</strong> Buding</span>
        </Link>
        <nav className="main-nav" aria-label="Primary navigation">
          {links.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link className={`nav-link ${active ? "active" : ""}`} href={link.href} key={link.href} aria-current={active ? "page" : undefined}>
                {link.label}
              </Link>
            );
          })}
          <a className="nav-link github-link" href="https://github.com/kernel-zh/buding" target="_blank" rel="noreferrer">
            Source ↗
          </a>
          <ApiKeyMenu />
        </nav>
      </div>
    </header>
  );
}
