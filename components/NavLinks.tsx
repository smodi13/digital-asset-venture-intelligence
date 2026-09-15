"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Partner Home", match: (p: string) => p === "/" },
  { href: "/sourcing", label: "Sourcing Engine", match: (p: string) => p.startsWith("/sourcing") },
  { href: "/worklist", label: "Sourcing Worklist", match: (p: string) => p.startsWith("/worklist") },
  { href: "/signals", label: "Signal Engine", match: (p: string) => p.startsWith("/signals") },
  { href: "/sources", label: "Source Intelligence", match: (p: string) => p.startsWith("/sources") },
  { href: "/market-map", label: "Market Map", match: (p: string) => p.startsWith("/market-map") },
  { href: "/radar", label: "Follow-On Radar", match: (p: string) => p.startsWith("/radar") },
  { href: "/relationships", label: "Relationship Intelligence", match: (p: string) => p.startsWith("/relationships") },
  { href: "/companies", label: "Companies", match: (p: string) => p.startsWith("/companies") },
  { href: "/methodology", label: "Methodology", match: (p: string) => p.startsWith("/methodology") },
];

export function NavLinks({ orientation = "vertical" }: { orientation?: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  return (
    <div>
      <ul
        className={
          orientation === "vertical"
            ? "flex flex-col gap-1"
            : "flex items-center gap-1 overflow-x-auto"
        }
      >
        {ITEMS.map((it) => {
          const active = it.match(pathname);
          return (
            <li key={it.href} className={orientation === "horizontal" ? "shrink-0" : undefined}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-[13px] no-underline transition-colors duration-[120ms] ${
                  active
                    ? "bg-[var(--accent-weak)] font-semibold text-[var(--accent)] before:absolute before:inset-y-1.5 before:left-0 before:w-[2px] before:rounded before:bg-[var(--accent)] before:content-['']"
                    : "text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
                }`}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
