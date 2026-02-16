import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Fact {
  id: string;
  title: string;
  statement_text: string;
  category: string | null;
  jurisdiction: string | null;
  source_link: string | null;
  owner_department: string | null;
  status: string | null;
}

interface FactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fact: Fact | null;
  onSave: (data: Omit<Fact, "id">) => Promise<void>;
  saving: boolean;
}

const CATEGORIES = ["Security", "Compliance", "Product", "Support", "Leadership", "Fees/Pricing", "Regulatory", "Partnerships", "General"];
const DEPARTMENTS = ["Legal", "Compliance", "Security", "Product", "Support", "Communications", "Engineering"];
const STATUSES = [
  { value: "under_review", label: "Under Review" },
  { value: "active", label: "Active" },
  { value: "deprecated", label: "Deprecated" },
];

export default function FactFormDialog({ open, onOpenChange, fact, onSave, saving }: FactFormDialogProps) {
  const [title, setTitle] = useState("");
  const [statementText, setStatementText] = useState("");
  const [category, setCategory] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [sourceLink, setSourceLink] = useState("");
  const [ownerDepartment, setOwnerDepartment] = useState("");
  const [status, setStatus] = useState("under_review");

  useEffect(() => {
    if (fact) {
      setTitle(fact.title);
      setStatementText(fact.statement_text);
      setCategory(fact.category || "");
      setJurisdiction(fact.jurisdiction || "");
      setSourceLink(fact.source_link || "");
      setOwnerDepartment(fact.owner_department || "");
      setStatus(fact.status || "under_review");
    } else {
      setTitle("");
      setStatementText("");
      setCategory("");
      setJurisdiction("");
      setSourceLink("");
      setOwnerDepartment("");
      setStatus("under_review");
    }
  }, [fact, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      title,
      statement_text: statementText,
      category: category || null,
      jurisdiction: jurisdiction || null,
      source_link: sourceLink || null,
      owner_department: ownerDepartment || null,
      status,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">{fact ? "Edit Fact" : "Add Approved Fact"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Official fee structure" required className="bg-muted border-border" />
          </div>

          <div className="space-y-2">
            <Label>Approved Statement *</Label>
            <Textarea value={statementText} onChange={e => setStatementText(e.target.value)} placeholder="The exact approved wording to use in responses..." required className="min-h-[100px] bg-muted border-border" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Owner Department</Label>
              <Select value={ownerDepartment} onValueChange={setOwnerDepartment}>
                <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Jurisdiction</Label>
              <Input value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} placeholder="e.g. Global, US, EU" className="bg-muted border-border" />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Source Link</Label>
            <Input value={sourceLink} onChange={e => setSourceLink(e.target.value)} placeholder="https://..." className="bg-muted border-border" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !title || !statementText}>
              {saving ? "Saving..." : fact ? "Update Fact" : "Create Fact"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
