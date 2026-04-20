import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Copy, Plus, Trash2, Check, Link, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface InviteCode {
  id: string;
  code: string;
  label: string | null;
  max_uses: number;
  times_used: number;
  expires_at: string | null;
  created_at: string;
}

export default function AdminInviteCodesTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [maxUses, setMaxUses] = useState("50");
  const [expiresAt, setExpiresAt] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data: codes = [], isLoading } = useQuery<InviteCode[]>({
    queryKey: ["admin-invite-codes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("beta_invite_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const generate = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 8; i++) result += chars[Math.floor(Math.random() * chars.length)];
    setNewCode(result);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newCode.trim()) throw new Error("Code is required");
      const { error } = await (supabase as any)
        .from("beta_invite_codes")
        .insert({
          code: newCode.trim().toUpperCase(),
          label: newLabel.trim() || null,
          max_uses: parseInt(maxUses) || 50,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          created_by: user?.id,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-invite-codes"] });
      setNewCode(""); setNewLabel(""); setMaxUses("50"); setExpiresAt("");
      toast.success("Invite code created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("beta_invite_codes")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-invite-codes"] });
      toast.success("Code deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const copyCode = (code: string, type: "code" | "link") => {
    const text = type === "link"
      ? `${window.location.origin}/auth?code=${code}`
      : code;
    navigator.clipboard.writeText(text);
    setCopied(`${code}-${type}`);
    setTimeout(() => setCopied(null), 2000);
    toast.success(type === "link" ? "Signup link copied" : "Code copied");
  };

  const isExpired = (code: InviteCode) =>
    !!code.expires_at && new Date(code.expires_at) < new Date();
  const isExhausted = (code: InviteCode) => code.times_used >= code.max_uses;

  return (
    <div className="space-y-6">
      {/* Create new code */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Create Invite Code</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Users who sign up with a valid code get an active Pro subscription (beta tier) — no payment needed.
            Share the code directly, or copy the pre-filled signup link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-1 space-y-1">
              <Label className="text-xs">Code</Label>
              <div className="flex gap-1.5">
                <Input
                  value={newCode}
                  onChange={e => setNewCode(e.target.value.toUpperCase())}
                  placeholder="BETA2026"
                  className="font-mono text-sm uppercase"
                />
                <Button size="icon" variant="outline" onClick={generate} title="Generate random code" className="shrink-0">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label (optional)</Label>
              <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Partner access" className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max uses</Label>
              <Input type="number" min={1} value={maxUses} onChange={e => setMaxUses(e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Expires (optional)</Label>
              <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="text-sm" />
            </div>
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!newCode.trim() || createMutation.isPending}
            size="sm"
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {createMutation.isPending ? "Creating…" : "Create Code"}
          </Button>
        </CardContent>
      </Card>

      {/* Existing codes */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Active Codes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
          ) : codes.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">No invite codes yet.</div>
          ) : (
            <div className="space-y-2">
              {codes.map(code => {
                const expired = isExpired(code);
                const exhausted = isExhausted(code);
                const inactive = expired || exhausted;
                return (
                  <div
                    key={code.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${inactive ? "border-border/50 opacity-60" : "border-border"} bg-muted/30`}
                  >
                    <code className="font-mono text-sm font-medium tracking-widest text-primary w-24 shrink-0">
                      {code.code}
                    </code>
                    <div className="flex-1 min-w-0">
                      {code.label && <p className="text-xs text-muted-foreground truncate">{code.label}</p>}
                      <p className="text-xs text-muted-foreground">
                        {code.times_used}/{code.max_uses} uses
                        {code.expires_at && ` · expires ${new Date(code.expires_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {expired && <Badge variant="destructive" className="text-[10px] h-5">Expired</Badge>}
                      {exhausted && !expired && <Badge variant="secondary" className="text-[10px] h-5">Exhausted</Badge>}
                      {!inactive && <Badge className="text-[10px] h-5 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Active</Badge>}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => copyCode(code.code, "code")}
                        title="Copy code"
                      >
                        {copied === `${code.code}-code` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => copyCode(code.code, "link")}
                        title="Copy signup link"
                      >
                        {copied === `${code.code}-link` ? <Check className="h-3 w-3 text-emerald-400" /> : <Link className="h-3 w-3" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(code.id)}
                        title="Delete code"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
