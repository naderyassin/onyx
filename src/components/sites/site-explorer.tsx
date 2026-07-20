"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Search, SearchX } from "lucide-react";
import {
  SITE_CATEGORIES,
  SUPPORTED_SITES,
  TOTAL_SUPPORTED_LABEL,
  YTDLP_SUPPORTED_SITES_URL,
  type SiteCategory,
} from "@/lib/sites";
import { cn } from "@/lib/utils";

type Filter = SiteCategory | "All";

export function SiteExplorer() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SUPPORTED_SITES.filter((site) => {
      if (filter !== "All" && site.category !== filter) return false;
      if (!q) return true;
      return site.name.toLowerCase().includes(q) || site.domain.includes(q);
    });
  }, [query, filter]);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/35"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sites…"
            aria-label="Search supported sites"
            className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.03] pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.05]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filter by category">
          {(["All", ...SITE_CATEGORIES] as Filter[]).map((category) => (
            <button
              key={category}
              type="button"
              role="radio"
              aria-checked={filter === category}
              onClick={() => setFilter(category)}
              className={cn(
                "h-8 rounded-full border px-3 text-[13px] transition-all",
                filter === category
                  ? "border-white bg-white text-black"
                  : "border-white/12 bg-white/[0.02] text-white/60 hover:border-white/30 hover:text-white",
              )}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-3xl border border-dashed border-white/12 py-16 text-center">
          <SearchX className="size-6 text-white/30" aria-hidden />
          <p className="mt-4 text-sm text-muted-foreground">
            No matches for &ldquo;{query}&rdquo; — but yt-dlp supports {TOTAL_SUPPORTED_LABEL}{" "}
            sites, so try pasting the link anyway.
          </p>
        </div>
      ) : (
        <motion.ul layout className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.map((site) => (
              <motion.li
                key={site.domain}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="group flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/25 hover:bg-white/[0.04]"
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 font-serif text-lg text-white/90">
                  {site.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{site.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{site.domain}</p>
                </div>
                {site.popular && (
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-white/35">
                    Popular
                  </span>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      <p className="mt-10 text-center text-sm text-muted-foreground">
        …and {TOTAL_SUPPORTED_LABEL} more via yt-dlp.{" "}
        <a
          href={YTDLP_SUPPORTED_SITES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-white/80 underline underline-offset-4 transition-colors hover:text-white hover:no-underline"
        >
          See the full list
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      </p>
    </div>
  );
}
