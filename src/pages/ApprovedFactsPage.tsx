import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookCheck, Plus, Search, CheckCircle2, Clock, Archive } from "lucide-react";

const mockFacts = [
  { title: "Official security audit completion", category: "Security", status: "active", department: "Security", lastReviewed: "Feb 10, 2026", jurisdiction: "Global" },
  { title: "Withdrawal processing SLA", category: "Withdrawals", status: "active", department: "Operations", lastReviewed: "Feb 1, 2026", jurisdiction: "Global" },
  { title: "Regulatory compliance statement", category: "Compliance", status: "under_review", department: "Legal", lastReviewed: "Jan 15, 2026", jurisdiction: "US" },
  { title: "CEO background and credentials", category: "Leadership", status: "active", department: "Communications", lastReviewed: "Feb 5, 2026", jurisdiction: "Global" },
  { title: "Deprecated pricing structure", category: "Fees/Pricing", status: "deprecated", department: "Product", lastReviewed: "Dec 20, 2025", jurisdiction: "Global" },
];

const statusConfig: Record<string, { icon: any; className: string; label: string }> = {
  active: { icon: CheckCircle2, className: "border-sentinel-emerald/30 text-sentinel-emerald", label: "Active" },
  under_review: { icon: Clock, className: "border-sentinel-amber/30 text-sentinel-amber", label: "Under Review" },
  deprecated: { icon: Archive, className: "border-muted-foreground/30 text-muted-foreground", label: "Deprecated" },
};

export default function ApprovedFactsPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Approved Facts</h1>
          <p className="text-sm text-muted-foreground mt-1">Governance library of verified facts</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Fact
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search facts..." className="pl-9 bg-card border-border" />
      </div>

      <div className="space-y-3">
        {mockFacts.map((f, i) => {
          const sc = statusConfig[f.status];
          return (
            <Card key={i} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <BookCheck className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm font-medium text-card-foreground">{f.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {f.department} · {f.jurisdiction} · Last reviewed {f.lastReviewed}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="text-[10px]">{f.category}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${sc.className}`}>
                    <sc.icon className="h-3 w-3 mr-1" />
                    {sc.label}
                  </Badge>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
