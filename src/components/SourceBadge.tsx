import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SOURCE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  twitter: { bg: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/30", label: "𝕏 Twitter" },
  reddit: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30", label: "Reddit" },
  news: { bg: "bg-sentinel-cyan/10", text: "text-sentinel-cyan", border: "border-sentinel-cyan/30", label: "News" },
  blogs: { bg: "bg-sentinel-purple/10", text: "text-sentinel-purple", border: "border-sentinel-purple/30", label: "Blogs" },
  forums: { bg: "bg-sentinel-amber/10", text: "text-sentinel-amber", border: "border-sentinel-amber/30", label: "Forums" },
  web: { bg: "bg-primary/10", text: "text-primary", border: "border-primary/30", label: "Web" },
};

interface SourceBadgeProps {
  source: string;
  className?: string;
}

export default function SourceBadge({ source, className }: SourceBadgeProps) {
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
        className
      )}
    >
      {style.label}
    </Badge>
  );
}
