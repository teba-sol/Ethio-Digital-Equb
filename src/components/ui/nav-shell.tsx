"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "◉" },
  { href: "/record", label: "Record", icon: "＋" },
  { href: "/ledger", label: "Debts", icon: "⇄" },
  { href: "/history", label: "History", icon: "☰" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="flex flex-1 flex-col pb-20">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 border-t border-foreground/10 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-around">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 text-xs ${
                  active
                    ? "font-semibold text-foreground"
                    : "text-foreground/50"
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
