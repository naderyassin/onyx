"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Globe, History, House, Settings2, type LucideIcon } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/logo";
import { EASE_OUT, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

const LINKS: NavLink[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/supported", label: "Supported Sites", icon: Globe },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4">
      <motion.nav
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="flex items-center gap-0.5 rounded-full border border-white/10 bg-black/55 p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        aria-label="Main navigation"
      >
        <Link
          href="/"
          aria-label="Onyx home"
          className="mr-1 flex items-center gap-2.5 rounded-full py-1 pl-1.5 pr-2 transition-opacity hover:opacity-80"
        >
          <LogoMark className="size-7 rounded-lg" iconClassName="size-3.5" />
          <Wordmark className="hidden text-lg sm:block" />
        </Link>

        {LINKS.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-label={link.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative rounded-full px-3 py-2.5 text-sm transition-colors md:px-3.5 md:py-2",
                active ? "text-white" : "text-white/55 hover:text-white/90",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-full bg-white/10"
                  transition={SPRING}
                />
              )}
              <span className="relative hidden md:block">{link.label}</span>
              <Icon className="relative size-4 md:hidden" aria-hidden />
            </Link>
          );
        })}
      </motion.nav>
    </header>
  );
}
