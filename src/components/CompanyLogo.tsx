/**
 * CompanyLogo — shows a company/domain logo via free favicon APIs
 *
 * Primary: Google gstatic faviconV2 — high-quality PNG, 64px, free, no auth
 * Secondary: DuckDuckGo icons — good coverage, free, no auth
 * Fallback: coloured initial-letter avatar
 *
 * Usage:
 *   <CompanyLogo domain="binance.com" name="Binance" size={20} />
 *   <CompanyLogo domain="youtube.com" name="YouTube" size={32} />
 *   <CompanyLogo domain="youtube" name="YouTube" size={16} />  // normalised automatically
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

// Normalise source names and common aliases to canonical domains
const DOMAIN_ALIASES: Record<string, string> = {
  // Platform source names
  youtube: "youtube.com",
  youtube_comment: "youtube.com",
  "youtube-comment": "youtube.com",
  twitter: "twitter.com",
  reddit: "reddit.com",
  linkedin: "linkedin.com",
  facebook: "facebook.com",
  tiktok: "tiktok.com",
  instagram: "instagram.com",
  "hacker news": "ycombinator.com",
  hackernews: "ycombinator.com",
  "hacker-news": "ycombinator.com",
  "google news": "google.com",
  "google-news": "google.com",
  "apple-app-store": "apple.com",
  "app-store": "apple.com",
  "google-play": "play.google.com",
  "spotify-podcast": "spotify.com",
  "apple-podcast": "podcasts.apple.com",
  "youtube-podcast": "youtube.com",
  trustpilot: "trustpilot.com",
  glassdoor: "glassdoor.com",
  capterra: "capterra.com",
  g2: "g2.com",
  yelp: "yelp.com",
  "brave-search": "search.brave.com",
  newsapi: "newsapi.org",
  // Press / media
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
  wsj: "wsj.com",
  "wall street journal": "wsj.com",
  ft: "ft.com",
  "financial times": "ft.com",
  guardian: "theguardian.com",
  "the guardian": "theguardian.com",
};

function normaliseDomain(input: string): string {
  if (!input) return "";
  const lower = input.toLowerCase().trim();

  // Already a domain (has a dot)
  if (lower.includes(".")) {
    return lower
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "")
      .replace(/^www\./, "");
  }

  // Source name or alias
  if (DOMAIN_ALIASES[lower]) return DOMAIN_ALIASES[lower];

  // Guess: append .com
  return `${lower}.com`;
}

// Deterministic colour — same company always gets same colour
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

// Google gstatic faviconV2 — best quality, free, returns 404 for unknown
function gstaticUrl(domain: string): string {
  return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=64`;
}

// DuckDuckGo icons — backup
function duckduckgoUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

type FetchState = "primary" | "secondary" | "failed";

interface CompanyLogoProps {
  /** Domain like "binance.com" or source name like "youtube" — normalised automatically */
  domain: string;
  /** Display name for fallback initial and aria-label */
  name?: string;
  /** Pixel size (square). Default 20. */
  size?: number;
  className?: string;
  /** Border radius class. Default "rounded-sm". */
  rounded?: "rounded-none" | "rounded-sm" | "rounded" | "rounded-md" | "rounded-full";
}

export default function CompanyLogo({
  domain,
  name,
  size = 20,
  className,
  rounded = "rounded-sm",
}: CompanyLogoProps) {
  const [state, setState] = useState<FetchState>("primary");

  const cleanDomain = normaliseDomain(domain);
  const displayName = name || cleanDomain;
  const initial = displayName.charAt(0).toUpperCase();
  const bgColour = stringToColour(displayName);

  if (!cleanDomain || state === "failed") {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center text-white font-semibold shrink-0",
          rounded,
          className
        )}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(8, Math.floor(size * 0.5)),
          backgroundColor: bgColour,
          lineHeight: 1,
        }}
        aria-label={displayName}
      >
        {initial}
      </span>
    );
  }

  const src = state === "primary"
    ? gstaticUrl(cleanDomain)
    : duckduckgoUrl(cleanDomain);

  return (
    <img
      src={src}
      alt={displayName}
      width={size}
      height={size}
      className={cn("object-contain shrink-0", rounded, className)}
      onError={() => {
        if (state === "primary") setState("secondary");
        else setState("failed");
      }}
      loading="lazy"
    />
  );
}
