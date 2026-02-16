import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Loader2, Trash2, RotateCcw } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

export default function DangerZoneTab() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [resetting, setResetting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const handleResetData = async () => {
    if (!currentOrg || confirmText !== currentOrg.name) return;
    setResetting(true);

    try {
      const orgId = currentOrg.id;

      // Delete in dependency order: junction tables first, then main tables
      await Promise.all([
        supabase.from("mention_narratives").delete().in(
          "mention_id",
          (await supabase.from("mentions").select("id").eq("org_id", orgId)).data?.map(m => m.id) || []
        ),
        supabase.from("mention_topics").delete().in(
          "mention_id",
          (await supabase.from("mentions").select("id").eq("org_id", orgId)).data?.map(m => m.id) || []
        ),
        supabase.from("mention_people").delete().in(
          "mention_id",
          (await supabase.from("mentions").select("id").eq("org_id", orgId)).data?.map(m => m.id) || []
        ),
        supabase.from("incident_mentions").delete().in(
          "incident_id",
          (await supabase.from("incidents").select("id").eq("org_id", orgId)).data?.map(i => i.id) || []
        ),
        supabase.from("incident_narratives").delete().in(
          "incident_id",
          (await supabase.from("incidents").select("id").eq("org_id", orgId)).data?.map(i => i.id) || []
        ),
        supabase.from("incident_events").delete().in(
          "incident_id",
          (await supabase.from("incidents").select("id").eq("org_id", orgId)).data?.map(i => i.id) || []
        ),
        supabase.from("escalation_comments").delete().in(
          "escalation_id",
          (await supabase.from("escalations").select("id").eq("org_id", orgId)).data?.map(e => e.id) || []
        ),
      ]);

      // Delete main data tables
      await Promise.all([
        supabase.from("mentions").delete().eq("org_id", orgId),
        supabase.from("narratives").delete().eq("org_id", orgId),
        supabase.from("incidents").delete().eq("org_id", orgId),
        supabase.from("escalations").delete().eq("org_id", orgId),
        supabase.from("scan_runs").delete().eq("org_id", orgId),
        supabase.from("alerts").delete().eq("org_id", orgId),
        supabase.from("response_drafts").delete().eq("org_id", orgId),
        supabase.from("email_logs").delete().eq("org_id", orgId),
      ]);

      setConfirmText("");
      toast({
        title: "Data reset complete",
        description: "All mentions, scans, incidents, narratives, escalations, and alerts have been cleared. Your keywords, sources, and settings are untouched.",
      });
    } catch (err: any) {
      toast({ title: "Error resetting data", description: err.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  return (
    <Card className="bg-card border-destructive/30 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
      </div>

      <div className="space-y-4">
        {/* Reset scan/mention data */}
        <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-destructive/20 bg-destructive/5">
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Organization Data
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Permanently delete all scan results, mentions, narratives, incidents, escalations, and alerts.
              Your keywords, sources, team members, and settings will be preserved — you can start fresh without re-configuring.
            </p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="shrink-0">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Reset Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Reset All Organization Data
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p>This will permanently delete:</p>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    <li>All mentions and scan results</li>
                    <li>All narratives and narrative assignments</li>
                    <li>All incidents and incident events</li>
                    <li>All escalations and comments</li>
                    <li>All alerts and email logs</li>
                    <li>All response drafts</li>
                  </ul>
                  <p className="font-medium text-card-foreground">
                    Your keywords, sources, team members, integrations, and settings will NOT be deleted.
                  </p>
                  <p className="text-sm">
                    Type <span className="font-mono font-bold text-destructive">{currentOrg?.name}</span> to confirm:
                  </p>
                  <Input
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder="Type organization name..."
                    className="mt-2"
                  />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setConfirmText("")}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleResetData}
                  disabled={confirmText !== currentOrg?.name || resetting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {resetting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  {resetting ? "Resetting..." : "Reset All Data"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  );
}
