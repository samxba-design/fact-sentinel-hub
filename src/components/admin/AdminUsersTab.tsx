import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default function AdminUsersTab() {
  const { data: profiles, isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: memberships } = useQuery({
    queryKey: ["admin-memberships"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_memberships")
        .select("*, organizations(name, subscription_status)");
      if (error) throw error;
      return data;
    },
  });

  const { data: userRoles } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="text-muted-foreground text-sm animate-pulse p-4">Loading users...</div>;
  }

  const getUserMemberships = (userId: string) =>
    memberships?.filter((m) => m.user_id === userId) ?? [];

  const getUserGlobalRoles = (userId: string) =>
    userRoles?.filter((r) => r.user_id === userId) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Registered Users ({profiles?.length ?? 0})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Global Roles</TableHead>
              <TableHead>Organizations</TableHead>
              <TableHead>Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles?.map((profile) => {
              const mems = getUserMemberships(profile.id);
              const roles = getUserGlobalRoles(profile.id);
              return (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium">
                    {profile.full_name || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {profile.email || "—"}
                  </TableCell>
                  <TableCell>
                    {roles.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {roles.map((r) => (
                          <Badge key={r.id} variant="secondary" className="text-xs">
                            {r.role}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">none</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {mems.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {mems.map((m) => (
                          <Badge key={m.id} variant="outline" className="text-xs">
                            {(m as any).organizations?.name ?? "?"} ({m.role})
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">none</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {profile.created_at
                      ? format(new Date(profile.created_at), "MMM d, yyyy")
                      : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
