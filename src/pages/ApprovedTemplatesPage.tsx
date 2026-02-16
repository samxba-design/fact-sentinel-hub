import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Plus, Search, CheckCircle2, Clock, Archive } from "lucide-react";

const mockTemplates = [
  { name: "Security Incident Response", scenario: "clarify", tone: "professional", platform: "general", status: "active" },
  { name: "Withdrawal Delay Explanation", scenario: "support", tone: "empathetic", platform: "general", status: "active" },
  { name: "Scam Warning Alert", scenario: "scam", tone: "urgent", platform: "short", status: "draft" },
  { name: "Outage Status Update", scenario: "outage", tone: "transparent", platform: "general", status: "active" },
  { name: "Regulatory Rumor Clarification", scenario: "regulatory", tone: "professional", platform: "long", status: "under_review" },
];

const statusConfig: Record<string, { className: string; label: string }> = {
  active: { className: "border-sentinel-emerald/30 text-sentinel-emerald", label: "Active" },
  draft: { className: "border-muted-foreground/30 text-muted-foreground", label: "Draft" },
  under_review: { className: "border-sentinel-amber/30 text-sentinel-amber", label: "Under Review" },
  deprecated: { className: "border-muted-foreground/30 text-muted-foreground", label: "Deprecated" },
};

export default function ApprovedTemplatesPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Approved Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Response templates with placeholders for approved facts</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Template
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search templates..." className="pl-9 bg-card border-border" />
      </div>

      <div className="space-y-3">
        {mockTemplates.map((t, i) => {
          const sc = statusConfig[t.status];
          return (
            <Card key={i} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm font-medium text-card-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{t.scenario}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{t.tone}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{t.platform}</Badge>
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] ${sc.className}`}>
                  {sc.label}
                </Badge>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
