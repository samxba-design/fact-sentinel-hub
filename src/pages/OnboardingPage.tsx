import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, ArrowRight, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function OnboardingPage() {
  const { user } = useAuth();
  const { refetchOrgs } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [orgName, setOrgName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: orgName, slug, domain, industry })
      .select()
      .single();

    if (orgError) {
      toast({ title: "Error", description: orgError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Create membership as owner
    const { error: memError } = await supabase
      .from("org_memberships")
      .insert({ org_id: org.id, user_id: user.id, role: "owner" as any, accepted_at: new Date().toISOString() });

    if (memError) {
      toast({ title: "Error", description: memError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Create tracking profile
    await supabase.from("tracking_profiles").insert({ org_id: org.id });

    await refetchOrgs();
    toast({ title: "Organization created!", description: `Welcome to ${orgName}` });
    navigate("/");
    setLoading(false);
  };

  return (
    <div className="dark min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-8 animate-fade-up">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 sentinel-glow">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Sentinel</h1>
          </div>
          <p className="text-muted-foreground">Set up your organization to get started</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 space-y-6 shadow-xl">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold text-card-foreground">Create Organization</h2>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-foreground">Organization name *</Label>
              <Input
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="Acme Corp"
                required
                className="bg-muted border-border"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Primary domain</Label>
              <Input
                value={domain}
                onChange={e => setDomain(e.target.value)}
                placeholder="acme.com"
                className="bg-muted border-border"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Industry</Label>
              <Input
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                placeholder="Fintech, SaaS, Healthcare..."
                className="bg-muted border-border"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating..." : "Create & Continue"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
