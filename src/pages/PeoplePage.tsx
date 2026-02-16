import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ShieldAlert, User2 } from "lucide-react";

const mockPeople = [
  { name: "Sarah Chen", title: "CEO", tier: "executive", mentions: 48, sentiment: -0.3, orgSentiment: -0.15, impersonation: true },
  { name: "Marcus Rivera", title: "CTO", tier: "executive", mentions: 22, sentiment: 0.1, orgSentiment: -0.15, impersonation: false },
  { name: "Dr. Lisa Park", title: "Chief Compliance Officer", tier: "compliance", mentions: 15, sentiment: -0.5, orgSentiment: -0.15, impersonation: false },
  { name: "James Okonkwo", title: "VP Product", tier: "product", mentions: 8, sentiment: -0.2, orgSentiment: -0.15, impersonation: false },
  { name: "Elena Volkov", title: "Head of Security", tier: "security", mentions: 31, sentiment: -0.6, orgSentiment: -0.15, impersonation: true },
];

export default function PeoplePage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">People</h1>
        <p className="text-sm text-muted-foreground mt-1">Executive exposure and people tracking</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockPeople.map((p, i) => (
          <Card key={i} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium text-card-foreground">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.title}</div>
                </div>
              </div>
              {p.impersonation && (
                <Badge className="bg-sentinel-red/10 text-sentinel-red border-sentinel-red/30 text-[10px]">
                  <ShieldAlert className="h-3 w-3 mr-1" />
                  Impersonation
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Mentions</div>
                <div className="text-sm font-mono text-card-foreground">{p.mentions}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Sentiment</div>
                <div className={`text-sm font-mono ${p.sentiment < -0.2 ? "text-sentinel-red" : p.sentiment > 0 ? "text-sentinel-emerald" : "text-sentinel-amber"}`}>
                  {p.sentiment > 0 ? "+" : ""}{p.sentiment.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Tier</div>
                <Badge variant="secondary" className="text-[10px] capitalize">{p.tier}</Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
