import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TicketCheck, Plus, MessageSquare } from "lucide-react";

const mockEscalations = [
  { title: "Missing facts for security breach response", department: "Security", priority: "critical", status: "open", requester: "System", created: "1h ago", comments: 0 },
  { title: "Regulatory compliance statement needs review", department: "Legal", priority: "high", status: "in_progress", requester: "Ana M.", created: "3h ago", comments: 2 },
  { title: "CEO impersonation scam response needed", department: "Communications", priority: "high", status: "open", requester: "System", created: "5h ago", comments: 1 },
  { title: "Withdrawal SLA fact outdated", department: "Operations", priority: "medium", status: "resolved", requester: "James O.", created: "2 days ago", comments: 4 },
];

const priorityColors: Record<string, string> = {
  low: "border-muted-foreground/30 text-muted-foreground",
  medium: "border-sentinel-amber/30 text-sentinel-amber",
  high: "border-sentinel-red/30 text-sentinel-red",
  critical: "border-sentinel-red/50 text-sentinel-red bg-sentinel-red/5",
};

const statusColors: Record<string, string> = {
  open: "border-sentinel-cyan/30 text-sentinel-cyan",
  in_progress: "border-sentinel-amber/30 text-sentinel-amber",
  resolved: "border-sentinel-emerald/30 text-sentinel-emerald",
};

export default function EscalationsPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Escalations</h1>
          <p className="text-sm text-muted-foreground mt-1">Tickets requiring human review and approval</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Ticket
        </Button>
      </div>

      <div className="space-y-3">
        {mockEscalations.map((e, i) => (
          <Card key={i} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <TicketCheck className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-sm font-medium text-card-foreground">{e.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {e.department} · {e.requester} · {e.created}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {e.comments > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MessageSquare className="h-3 w-3" /> {e.comments}
                  </span>
                )}
                <Badge variant="outline" className={`text-[10px] ${priorityColors[e.priority]}`}>
                  {e.priority}
                </Badge>
                <Badge variant="outline" className={`text-[10px] capitalize ${statusColors[e.status]}`}>
                  {e.status.replace("_", " ")}
                </Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
