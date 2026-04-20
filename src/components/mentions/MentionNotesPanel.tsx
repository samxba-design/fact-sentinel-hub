import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageSquare, Flag, Zap, Link2, Plus, Trash2, Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Note {
  id: string;
  content: string;
  note_type: string;
  created_at: string;
  user_id: string | null;
}

interface MentionNotesPanelProps {
  mentionId: string;
}

const NOTE_TYPES = [
  { value: "comment",  label: "Comment",  icon: <MessageSquare className="h-3 w-3" /> },
  { value: "flag",     label: "Flag",     icon: <Flag className="h-3 w-3" /> },
  { value: "action",   label: "Action",   icon: <Zap className="h-3 w-3" /> },
  { value: "context",  label: "Context",  icon: <Link2 className="h-3 w-3" /> },
];

const NOTE_TYPE_STYLES: Record<string, string> = {
  comment: "bg-muted/50 border-border text-foreground",
  flag:    "bg-sentinel-red/5 border-sentinel-red/20 text-sentinel-red",
  action:  "bg-primary/5 border-primary/20 text-primary",
  context: "bg-blue-500/5 border-blue-500/20 text-blue-400",
};

export default function MentionNotesPanel({ mentionId }: MentionNotesPanelProps) {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [type, setType] = useState("comment");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadNotes() {
    if (!mentionId) return;
    const { data } = await supabase
      .from("mention_notes" as any)
      .select("id, content, note_type, created_at, user_id")
      .eq("mention_id", mentionId)
      .order("created_at", { ascending: true });
    setNotes((data as Note[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { loadNotes(); }, [mentionId]);

  async function addNote() {
    if (!text.trim() || !currentOrg) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("mention_notes" as any).insert({
        mention_id: mentionId,
        org_id: currentOrg.id,
        user_id: user?.id ?? null,
        content: text.trim(),
        note_type: type,
      });
      if (error) throw new Error(error.message);
      setText("");
      await loadNotes();
    } catch (e: any) {
      toast({ title: "Failed to save note", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(id: string) {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("mention_notes" as any).delete().eq("id", id);
      if (error) throw new Error(error.message);
      setNotes(n => n.filter(x => x.id !== id));
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  const NoteTypeIcon = ({ t }: { t: string }) => {
    const def = NOTE_TYPES.find(n => n.value === t);
    return def ? def.icon : <MessageSquare className="h-3 w-3" />;
  };

  return (
    <div className="space-y-3">
      {/* Existing notes */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2 text-center">No notes yet. Add context, flags, or action items below.</p>
      ) : (
        <div className="space-y-2">
          {notes.map(note => (
            <div
              key={note.id}
              className={`rounded-lg border p-3 text-xs ${NOTE_TYPE_STYLES[note.note_type] ?? NOTE_TYPE_STYLES.comment}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 mb-1 opacity-70">
                  <NoteTypeIcon t={note.note_type} />
                  <span className="capitalize font-medium">{note.note_type}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                  </span>
                </div>
                <button
                  onClick={() => deleteNote(note.id)}
                  disabled={deletingId === note.id}
                  className="opacity-0 group-hover:opacity-100 hover:opacity-100 text-muted-foreground hover:text-sentinel-red transition-opacity p-0.5"
                >
                  {deletingId === note.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Trash2 className="h-3 w-3" />
                  }
                </button>
              </div>
              <p className="leading-relaxed whitespace-pre-wrap">{note.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add note form */}
      <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
        <Textarea
          placeholder="Add a note, flag, action item, or context link…"
          value={text}
          onChange={e => setText(e.target.value)}
          className="min-h-[72px] text-xs resize-none border-0 p-0 focus-visible:ring-0 bg-transparent"
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote();
          }}
        />
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-7 w-28 text-[11px] border-0 p-1 bg-transparent focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value} className="text-xs">
                  <span className="flex items-center gap-1.5">{t.icon}{t.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">⌘↵ to save</span>
            <Button
              size="sm" className="h-7 text-xs gap-1 px-3"
              onClick={addNote} disabled={!text.trim() || saving}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
