import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle, XCircle } from "lucide-react";

type OrgWithSub = {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  created_at: string | null;
  subscription_status: string;
  subscription_type: string | null;
  subscription_expires_at: string | null;
  subscription_approved_by: string | null;
  subscription_approved_at: string | null;
  [key: string]: any;
};

export default function AdminOrgsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: orgs, isLoading } = useQuery({
    queryKey: ["admin-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as OrgWithSub[];
    },
  });

  const { data: memberCounts } = useQuery({
    queryKey: ["admin-org-member-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_memberships")
        .select("org_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((m) => {
        counts[m.org_id] = (counts[m.org_id] || 0) + 1;
      });
      return counts;
    },
  });

  const updateSubscription = useMutation({
    mutationFn: async ({
      orgId,
      status,
      type,
    }: {
      orgId: string;
      status: string;
      type?: string;
    }) => {
      const updates: any = {
        subscription_status: status,
        subscription_type: type || null,
      };
      if (status === "active") {
        updates.subscription_approved_by = user?.id;
        updates.subscription_approved_at = new Date().toISOString();
        // Set expiry 1 year out for yearly, 1 month for monthly
        const exp = new Date();
        if (type === "yearly") exp.setFullYear(exp.getFullYear() + 1);
        else exp.setMonth(exp.getMonth() + 1);
        updates.subscription_expires_at = exp.toISOString();
      } else if (status === "free") {
        updates.subscription_approved_by = null;
        updates.subscription_approved_at = null;
        updates.subscription_expires_at = null;
        updates.subscription_type = null;
      }

      const { error } = await supabase
        .from("organizations")
        .update(updates)
        .eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orgs"] });
      toast.success("Subscription updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "active":
        return "default";
      case "expired":
      case "cancelled":
        return "destructive";
      default:
        return "secondary";
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground text-sm animate-pulse p-4">Loading organizations...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Organizations ({orgs?.length ?? 0})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs?.map((org) => (
              <TableRow key={org.id}>
                <TableCell className="font-medium">{org.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{org.plan}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={statusColor(org.subscription_status)} className="text-xs">
                    {org.subscription_status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {org.subscription_type || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {memberCounts?.[org.id] ?? 0}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {org.created_at
                    ? format(new Date(org.created_at), "MMM d, yyyy")
                    : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {org.subscription_status !== "active" ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() =>
                            updateSubscription.mutate({
                              orgId: org.id,
                              status: "active",
                              type: "monthly",
                            })
                          }
                        >
                          <CheckCircle className="h-3 w-3" /> Monthly
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() =>
                            updateSubscription.mutate({
                              orgId: org.id,
                              status: "active",
                              type: "yearly",
                            })
                          }
                        >
                          <CheckCircle className="h-3 w-3" /> Yearly
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1 text-destructive"
                        onClick={() =>
                          updateSubscription.mutate({
                            orgId: org.id,
                            status: "free",
                          })
                        }
                      >
                        <XCircle className="h-3 w-3" /> Revoke
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
