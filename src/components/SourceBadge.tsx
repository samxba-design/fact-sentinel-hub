import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SOURCE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  twitter: { bg: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/30", label: "𝕏 Twitter" },
  reddit: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30", label: "Reddit" },
  news: { bg: "bg-sentinel-cyan/10", text: "text-sentinel-cyan", border: "border-sentinel-cyan/30", label: "News" },
  blogs: { bg: "bg-sentinel-purple/10", text: "text-sentinel-purple", border: "border-sentinel-purple/30", label: "Blogs" },
  forums: { bg: "bg-sentinel-amber/10", text: "text-sentinel-amber", border: "border-sentinel-amber/30", label: "Forums" },
  web: { bg: "bg-primary/10", text: "text-primary", border: "border-primary/30", label: "Web" },
  youtube: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30", label: "YouTube" },
  linkedin: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30", label: "LinkedIn" },
  facebook: { bg: "bg-blue-600/10", text: "text-blue-500", border: "border-blue-600/30", label: "Facebook" },
  trustpilot: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30", label: "Trustpilot" },
  g2: { bg: "bg-orange-600/10", text: "text-orange-500", border: "border-orange-600/30", label: "G2" },
  blog: { bg: "bg-sentinel-purple/10", text: "text-sentinel-purple", border: "border-sentinel-purple/30", label: "Blog" },
  forum: { bg: "bg-sentinel-amber/10", text: "text-sentinel-amber", border: "border-sentinel-amber/30", label: "Forum" },
  "apple-app-store": { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30", label: "App Store" },
  "google-play": { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30", label: "Google Play" },
  "app-store": { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30", label: "App Store" },
  podcast: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30", label: "Podcast" },
  "spotify-podcast": { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30", label: "Spotify" },
  "apple-podcast": { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30", label: "Apple Podcasts" },
  "youtube-podcast": { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30", label: "YT Podcast" },
  glassdoor: { bg: "bg-green-600/10", text: "text-green-500", border: "border-green-600/30", label: "Glassdoor" },
  capterra: { bg: "bg-blue-600/10", text: "text-blue-500", border: "border-blue-600/30", label: "Capterra" },
  yelp: { bg: "bg-red-600/10", text: "text-red-500", border: "border-red-600/30", label: "Yelp" },
};

interface SourceBadgeProps {
  source: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export default function SourceBadge({ source, className, onClick }: SourceBadgeProps) {
  const style = SOURCE_STYLES[source.toLowerCase()] || {
    bg: "bg-muted/30",
    text: "text-muted-foreground",
    border: "border-border",
    label: source,
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-medium",
        style.bg,
        style.text,
        style.border,
        onClick && "cursor-pointer hover:opacity-80 transition-opacity",
        className
      )}
      onClick={onClick}
    >
      {style.label}
    </Badge>
  );
}

/** Get the appropriate audience label for a source type */
export function getReachLabel(source: string): string {
  const s = source.toLowerCase();
  if (s === "youtube") return "subscribers";
  if (s === "twitter" || s === "x") return "followers";
  if (s === "reddit") return "karma";
  if (s === "linkedin") return "connections";
  if (s === "facebook") return "friends";
  if (s === "tiktok") return "followers";
  return "followers";
}

/** Format reach count - returns null if count is 0/null/undefined (hidden when irrelevant) */
export function formatReachDisplay(count: number | null | undefined, source: string): { value: string; label: string } | null {
  if (!count || count === 0) return null;
  const label = getReachLabel(source);
  let value: string;
  if (count >= 1_000_000) value = `${(count / 1_000_000).toFixed(1)}M`;
  else if (count >= 1_000) value = `${(count / 1_000).toFixed(1)}K`;
  else value = String(count);
  return { value, label };
}
