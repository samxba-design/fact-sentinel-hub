import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface IncidentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editData?: {
    id: string;
    name: string;
    description: string | null;
    status: string | null;
  } | null;
}

export default function IncidentFormDialog({ open, onOpenChange, onSaved, editData }: IncidentFormDialogProps) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(editData?.name || "");
  const [description, setDescription] = useState(editData?.description || "");
  const [status, setStatus] = useState(editData?.status || "active");

  const isEdit = !!editData;

  const handleSave = async () => {
    if (!currentOrg || !name.trim()) return;
    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase
          .from("incidents")
          .update({ name, description: description || null, status, updated_at: new Date().toISOString() })
          .eq("id", editData.id);
        if (error) throw error;
        // Add timeline event
        await supabase.from("incident_events").insert({
          incident_id: editData.id,
          event_type: "status_change",
          description: `Status changed to ${status}`,
        });
        toast({ title: "Incident updated" });
      } else {
        const { data, error } = await supabase
          .from("incidents")
          .insert({
            org_id: currentOrg.id,
            name,
            description: description || null,
            status,
            owner_id: user?.id || null,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (error) throw error;
        // Add creation event
        await supabase.from("incident_events").insert({
          incident_id: data.id,
          event_type: "created",
          description: "Incident created",
        });
        toast({ title: "Incident created" });
      }
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Incident" : "New Incident"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Incident Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Data breach rumor — Twitter" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Context about the incident..." rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="monitoring">Monitoring</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
