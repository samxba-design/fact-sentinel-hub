import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Building2, ScrollText, CreditCard } from "lucide-react";
import AdminUsersTab from "@/components/admin/AdminUsersTab";
import AdminOrgsTab from "@/components/admin/AdminOrgsTab";
import AdminAuditTab from "@/components/admin/AdminAuditTab";
import AdminSubscriptionsTab from "@/components/admin/AdminSubscriptionsTab";

export default function AdminPage() {
  const { isSuperAdmin } = useAuth();

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage users, organizations, subscriptions, and view audit logs.
        </p>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" /> Users
          </TabsTrigger>
          <TabsTrigger value="orgs" className="gap-2">
            <Building2 className="h-4 w-4" /> Organizations
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <ScrollText className="h-4 w-4" /> Audit Logs
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="gap-2">
            <CreditCard className="h-4 w-4" /> Subscriptions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <AdminUsersTab />
        </TabsContent>
        <TabsContent value="orgs">
          <AdminOrgsTab />
        </TabsContent>
        <TabsContent value="audit">
          <AdminAuditTab />
        </TabsContent>
        <TabsContent value="subscriptions">
          <AdminSubscriptionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
