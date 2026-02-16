import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import { useState } from "react";

export default function AdminSubscriptionsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const { data: requests, isLoading } = useQuery({
    queryKey: ["admin-subscription-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: orgs } = useQuery({
    queryKey: ["admin-orgs-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["admin-profiles-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return data;
    },
  });

  const orgName = (id: string) => orgs?.find((o) => o.id === id)?.name ?? "Unknown";
  const userName = (id: string) => {
    const p = profiles?.find((p) => p.id === id);
    return p?.full_name || p?.email || "Unknown";
  };

  const reviewMutation = useMutation({
    mutationFn: async ({ requestId, orgId, status, type }: { requestId: string; orgId: string; status: "approved" | "rejected"; type: string }) => {
      // Update request
      const { error: reqErr } = await supabase
        .from("subscription_requests")
        .update({
          status,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNotes[requestId] || null,
        })
        .eq("id", requestId);
      if (reqErr) throw reqErr;

      // If approved, update org subscription
      if (status === "approved") {
        const exp = new Date();
        if (type === "yearly") exp.setFullYear(exp.getFullYear() + 1);
        else exp.setMonth(exp.getMonth() + 1);

        const { error: orgErr } = await supabase
          .from("organizations")
          .update({
            subscription_status: "active",
            subscription_type: type,
            subscription_approved_by: user?.id,
            subscription_approved_at: new Date().toISOString(),
            subscription_expires_at: exp.toISOString(),
          })
          .eq("id", orgId);
        if (orgErr) throw orgErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-orgs"] });
      toast.success("Request reviewed");
    },
    onError: (e) => toast.error(e.message),
  });

  const statusBadge = (s: string) => {
    switch (s) {
      case "approved": return <Badge className="text-xs">Approved</Badge>;
      case "rejected": return <Badge variant="destructive" className="text-xs">Rejected</Badge>;
      default: return <Badge variant="secondary" className="text-xs gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground text-sm animate-pulse p-4">Loading requests...</div>;
  }

  const pending = requests?.filter((r) => r.status === "pending") ?? [];
  const reviewed = requests?.filter((r) => r.status !== "pending") ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pending Requests ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-muted-foreground text-sm">No pending subscription requests.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{orgName(req.org_id)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{userName(req.requested_by)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{req.requested_type}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{req.message || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {format(new Date(req.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Textarea
                        placeholder="Review note..."
                        className="h-8 text-xs min-h-[32px] w-40"
                        value={reviewNotes[req.id] || ""}
                        onChange={(e) => setReviewNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => reviewMutation.mutate({ requestId: req.id, orgId: req.org_id, status: "approved", type: req.requested_type })}
                          disabled={reviewMutation.isPending}
                        >
                          <CheckCircle className="h-3 w-3" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 text-destructive"
                          onClick={() => reviewMutation.mutate({ requestId: req.id, orgId: req.org_id, status: "rejected", type: req.requested_type })}
                          disabled={reviewMutation.isPending}
                        >
                          <XCircle className="h-3 w-3" /> Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {reviewed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-muted-foreground">Review History ({reviewed.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reviewed By</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewed.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{orgName(req.org_id)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{req.requested_type}</Badge></TableCell>
                    <TableCell>{statusBadge(req.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{req.reviewed_by ? userName(req.reviewed_by) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{req.review_note || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {req.reviewed_at ? format(new Date(req.reviewed_at), "MMM d, yyyy") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
