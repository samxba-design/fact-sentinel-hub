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

interface EscalationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editData?: {
    id: string;
    title: string;
    description: string | null;
    department: string | null;
    priority: string | null;
    status: string | null;
    pasted_text: string | null;
  } | null;
}

export default function EscalationFormDialog({ open, onOpenChange, onSaved, editData }: EscalationFormDialogProps) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState(editData?.title || "");
  const [description, setDescription] = useState(editData?.description || "");
  const [department, setDepartment] = useState(editData?.department || "");
  const [priority, setPriority] = useState(editData?.priority || "medium");
  const [status, setStatus] = useState(editData?.status || "open");
  const [pastedText, setPastedText] = useState(editData?.pasted_text || "");

  const isEdit = !!editData;

  const handleSave = async () => {
    if (!currentOrg || !title.trim()) return;
    setSaving(true);

    try {
      if (isEdit) {
        const { error } = await supabase
          .from("escalations")
          .update({ title, description: description || null, department: department || null, priority, status, pasted_text: pastedText || null, updated_at: new Date().toISOString() })
          .eq("id", editData.id);
        if (error) throw error;
        toast({ title: "Escalation updated" });
      } else {
        const { error } = await supabase
          .from("escalations")
          .insert({ org_id: currentOrg.id, title, description: description || null, department: department || null, priority, status, pasted_text: pastedText || null, requester_id: user?.id || null });
        if (error) throw error;
        toast({ title: "Escalation created" });
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Escalation" : "New Escalation"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief summary of the issue" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Details about what needs review..." rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Pasted Content</Label>
            <Textarea value={pastedText} onChange={e => setPastedText(e.target.value)} placeholder="Paste the original content that triggered this escalation..." rows={3} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Department</Label>
              <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Legal" />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
