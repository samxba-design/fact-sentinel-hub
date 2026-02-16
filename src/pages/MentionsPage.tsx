import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ExternalLink, AlertTriangle, Flag } from "lucide-react";

const mockMentions = [
  {
    id: "1", source: "Reddit", author: "u/crypto_watcher", content: "Their security practices are concerning after the latest breach...",
    sentiment: "negative", severity: "high", topics: ["Security"], posted: "2h ago", reach: "15.2K",
    flags: { falseClaim: false, emergency: false }
  },
  {
    id: "2", source: "X", author: "@tech_analyst", content: "Just announced a major partnership with leading compliance firm",
    sentiment: "positive", severity: "low", topics: ["Partnerships"], posted: "4h ago", reach: "45.8K",
    flags: { falseClaim: false, emergency: false }
  },
  {
    id: "3", source: "News", author: "TechCrunch", content: "BREAKING: Company faces regulatory scrutiny over withdrawal delays",
    sentiment: "negative", severity: "critical", topics: ["Regulatory", "Withdrawals"], posted: "1h ago", reach: "2.1M",
    flags: { falseClaim: true, emergency: true }
  },
  {
    id: "4", source: "App Store", author: "frustated_user_99", content: "App crashes every time I try to withdraw. Terrible experience.",
    sentiment: "negative", severity: "medium", topics: ["Product/Outage", "Support"], posted: "6h ago", reach: "120",
    flags: { falseClaim: false, emergency: false }
  },
  {
    id: "5", source: "Reddit", author: "u/market_moves", content: "CEO was spotted at a fintech conference discussing expansion plans",
    sentiment: "neutral", severity: "low", topics: ["Leadership"], posted: "8h ago", reach: "3.4K",
    flags: { falseClaim: false, emergency: false }
  },
];

const severityColors: Record<string, string> = {
  low: "border-sentinel-emerald/30 text-sentinel-emerald bg-sentinel-emerald/5",
  medium: "border-sentinel-amber/30 text-sentinel-amber bg-sentinel-amber/5",
  high: "border-sentinel-red/30 text-sentinel-red bg-sentinel-red/5",
  critical: "border-sentinel-red/50 text-sentinel-red bg-sentinel-red/10",
};

const sentimentColors: Record<string, string> = {
  positive: "text-sentinel-emerald",
  negative: "text-sentinel-red",
  neutral: "text-muted-foreground",
};

export default function MentionsPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mentions</h1>
        <p className="text-sm text-muted-foreground mt-1">All detected mentions across sources</p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search mentions..." className="pl-9 bg-card border-border" />
      </div>

      {/* Mention list */}
      <div className="space-y-3">
        {mockMentions.map(m => (
          <Card key={m.id} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{m.source}</Badge>
                  <span className="text-xs text-muted-foreground">by {m.author}</span>
                  <span className="text-xs text-muted-foreground">· {m.posted}</span>
                  {m.flags.emergency && (
                    <Badge className="bg-sentinel-red/10 text-sentinel-red border-sentinel-red/30 text-[10px]">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Emergency
                    </Badge>
                  )}
                  {m.flags.falseClaim && (
                    <Badge className="bg-sentinel-amber/10 text-sentinel-amber border-sentinel-amber/30 text-[10px]">
                      <Flag className="h-3 w-3 mr-1" />
                      False Claim
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-card-foreground">{m.content}</p>
                <div className="flex items-center gap-2">
                  {m.topics.map(t => (
                    <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </div>
              <div className="text-right space-y-2 shrink-0">
                <Badge variant="outline" className={`text-[10px] ${severityColors[m.severity]}`}>
                  {m.severity}
                </Badge>
                <div className={`text-xs font-medium ${sentimentColors[m.sentiment]}`}>{m.sentiment}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{m.reach} reach</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
