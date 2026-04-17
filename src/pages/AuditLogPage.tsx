import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import PageGuide from "@/components/PageGuide";

const PAGE_SIZE = 50;

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  update: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  delete: "bg-red-500/10 text-red-500 border-red-500/20",
  login:  "bg-purple-500/10 text-purple-500 border-purple-500/20",
  invite: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  scan:   "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
};

function getActionColor(action: string) {
  const key = Object.keys(ACTION_COLORS).find(k => action?.toLowerCase().includes(k));
  return key ? ACTION_COLORS[key] : "bg-muted text-muted-foreground";
}

export default function AuditLogPage() {
  const { currentOrg } = useOrg();
  const [page, setPage] = useState(0);
  const [entityFilter, setEntityFilter] = useState("all");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["audit-logs", currentOrg?.id, page, entityFilter],
    enabled: !!currentOrg,
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .eq("org_id", currentOrg!.id)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (entityFilter !== "all") {
        query = query.eq("entity_type", entityFilter);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { logs: data ?? [], total: count ?? 0 };
    },
  });

  // Gather unique entity types for filter
  const { data: entityTypes } = useQuery({
    queryKey: ["audit-logs-entity-types", currentOrg?.id],
    enabled: !!currentOrg,
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("entity_type")
        .eq("org_id", currentOrg!.id)
        .limit(500);
      const types = [...new Set((data ?? []).map((r: any) => r.entity_type).filter(Boolean))].sort();
      return types as string[];
    },
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);
  const logs = data?.logs ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageGuide
        title="Audit Log"
        subtitle="A complete record of all actions taken in your organization — who did what, and when."
        steps={[
          { icon: <ClipboardList className="h-4 w-4 text-primary" />, title: "Full history", description: "Every create, update, delete, scan, and login event is recorded with timestamps and user context." },
        ]}
      />

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data?.total ?? "—"} total events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(0); }}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(entityTypes ?? []).map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="border-border overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">No audit events recorded yet</p>
            <p className="text-xs text-muted-foreground mt-1">Events appear here as your team uses the platform</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">Time</TableHead>
                <TableHead className="w-32">Action</TableHead>
                <TableHead className="w-32">Type</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log: any) => (
                <TableRow key={log.id} className="hover:bg-muted/30">
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {log.created_at ? (
                      <span title={format(new Date(log.created_at), "PPpp")}>
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getActionColor(log.action)}`}>
                      {log.action ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {log.entity_type ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {log.entity_id ? `${log.entity_id.slice(0, 8)}…` : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                    {log.user_id ? `${log.user_id.slice(0, 8)}…` : "system"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                    {log.details ? JSON.stringify(log.details).slice(0, 100) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page + 1} of {totalPages} ({data?.total} events)</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
