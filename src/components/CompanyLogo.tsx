/**
 * CompanyLogo — shows a company/domain logo via logo.dev CDN
 *
 * Usage:
 *   <CompanyLogo domain="binance.com" name="Binance" size={20} />
 *   <CompanyLogo domain="youtube.com" name="YouTube" size={32} />
 *
 * Falls back to a coloured initial-letter avatar if the logo fails to load.
 * Token is optional: set VITE_LOGO_DEV_TOKEN in .env for better coverage.
 *
 * Domains that map to a known subdomain or well-known logo are normalised
 * via DOMAIN_ALIASES below.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

// Some domains need normalising — e.g. "nytimes.com" works, "newyorktimes.com" doesn't.
// Map common aliases and source names to the canonical logo domain.
const DOMAIN_ALIASES: Record<string, string> = {
  // Sources
  youtube: "youtube.com",
  twitter: "twitter.com",
  reddit: "reddit.com",
  "hacker news": "ycombinator.com",
  hackernews: "ycombinator.com",
  "google news": "google.com",
  applenews: "apple.com",
  "app store": "apple.com",
  "google play": "google.com",
  trustpilot: "trustpilot.com",
  glassdoor: "glassdoor.com",
  capterra: "capterra.com",
  g2: "g2.com",
  // Press
  nytimes: "nytimes.com",
  "new york times": "nytimes.com",
  bloomberg: "bloomberg.com",
  reuters: "reuters.com",
  bbc: "bbc.com",
  "bbc news": "bbc.com",
  cnn: "cnn.com",
  forbes: "forbes.com",
  techcrunch: "techcrunch.com",
  wired: "wired.com",
  verge: "theverge.com",
  "the verge": "theverge.com",
  "ars technica": "arstechnica.com",
  arstechnica: "arstechnica.com",
  coindesk: "coindesk.com",
  cointelegraph: "cointelegraph.com",
  decrypt: "decrypt.co",
  "the block": "theblock.co",
};

// Deterministic colour from string — gives each company a consistent fallback colour
function stringToColour(s: string): string {
  const COLOURS = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
    "#10b981", "#3b82f6", "#ef4444", "#14b8a6",
    "#f97316", "#84cc16",
  ];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return COLOURS[Math.abs(hash) % COLOURS.length];
}

function normaliseDomain(domain: string): string {
  if (!domain) return "";
  const lower = domain.toLowerCase().trim();

  // If it's already a domain (contains a dot), clean it up
  if (lower.includes(".")) {
    // Strip scheme, path, port
    return lower.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/^www\./, "");
  }

  // Otherwise look up in aliases or append .com
  return DOMAIN_ALIASES[lower] || `${lower}.com`;
}

function buildLogoUrl(domain: string, size: number): string {
  const token = (import.meta as any).env?.VITE_LOGO_DEV_TOKEN;
  const base = `https://img.logo.dev/${domain}?size=${size}&format=webp`;
  return token ? `${base}&token=${token}` : base;
}

interface CompanyLogoProps {
  /** Domain like "binance.com" or source name like "youtube" — will be normalised */
  domain: string;
  /** Display name used for fallback initial and aria-label */
  name?: string;
  /** Pixel size (width = height). Default 20. */
  size?: number;
  className?: string;
  /** Border radius. Default "rounded-sm". */
  rounded?: "rounded-none" | "rounded-sm" | "rounded" | "rounded-md" | "rounded-full";
}

export default function CompanyLogo({
  domain,
  name,
  size = 20,
  className,
  rounded = "rounded-sm",
}: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);

  const cleanDomain = normaliseDomain(domain);
  const displayName = name || cleanDomain;
  const initial = displayName.charAt(0).toUpperCase();
  const bgColour = stringToColour(displayName);

  if (!cleanDomain || failed) {
    // Fallback: coloured initial avatar
    return (
      <span
        className={cn("inline-flex items-center justify-center text-white font-semibold shrink-0", rounded, className)}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(8, Math.floor(size * 0.5)),
          backgroundColor: bgColour,
        }}
        aria-label={displayName}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={buildLogoUrl(cleanDomain, size)}
      alt={displayName}
      width={size}
      height={size}
      className={cn("object-contain shrink-0", rounded, className)}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
