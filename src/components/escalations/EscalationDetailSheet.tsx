import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, Send, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Comment {
  id: string;
  content: string;
  created_at: string | null;
  user_id: string | null;
}

interface EscalationDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  escalation: {
    id: string;
    title: string;
    description: string | null;
    department: string | null;
    priority: string | null;
    status: string | null;
    pasted_text: string | null;
    created_at: string | null;
  } | null;
  onEdit: () => void;
  onDelete: () => void;
}

const priorityColors: Record<string, string> = {
  low: "border-muted-foreground/30 text-muted-foreground",
  medium: "border-sentinel-amber/30 text-sentinel-amber",
  high: "border-sentinel-red/30 text-sentinel-red",
  critical: "border-sentinel-red/50 text-sentinel-red bg-sentinel-red/5",
};

const statusColors: Record<string, string> = {
  open: "border-sentinel-cyan/30 text-sentinel-cyan",
  in_progress: "border-sentinel-amber/30 text-sentinel-amber",
  resolved: "border-sentinel-emerald/30 text-sentinel-emerald",
};

export default function EscalationDetailSheet({ open, onOpenChange, escalation, onEdit, onDelete }: EscalationDetailSheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);

  useEffect(() => {
    if (!escalation || !open) return;
    setLoadingComments(true);
    supabase
      .from("escalation_comments")
      .select("id, content, created_at, user_id")
      .eq("escalation_id", escalation.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setComments(data || []);
        setLoadingComments(false);
      });
  }, [escalation, open]);

  const handlePost = async () => {
    if (!escalation || !newComment.trim()) return;
    setPosting(true);
    try {
      const { data, error } = await supabase
        .from("escalation_comments")
        .insert({ escalation_id: escalation.id, content: newComment.trim(), user_id: user?.id || null })
        .select()
        .single();
      if (error) throw error;
      setComments(prev => [...prev, data]);
      setNewComment("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  if (!escalation) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left pr-8">{escalation.title}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] ${priorityColors[escalation.priority || "medium"]}`}>
              {escalation.priority || "medium"}
            </Badge>
            <Badge variant="outline" className={`text-[10px] capitalize ${statusColors[escalation.status || "open"]}`}>
              {(escalation.status || "open").replace("_", " ")}
            </Badge>
            {escalation.department && (
              <Badge variant="secondary" className="text-[10px]">{escalation.department}</Badge>
            )}
          </div>

          {escalation.created_at && (
            <p className="text-xs text-muted-foreground">
              Created {format(new Date(escalation.created_at), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}

          {escalation.description && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{escalation.description}</p>
            </div>
          )}

          {escalation.pasted_text && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Original Content</p>
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-foreground whitespace-pre-wrap border border-border">
                {escalation.pasted_text}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Comments ({comments.length})
            </p>

            {loadingComments ? (
              <p className="text-xs text-muted-foreground animate-pulse">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No comments yet.</p>
            ) : (
              <div className="space-y-3">
                {comments.map(c => (
                  <div key={c.id} className="bg-muted/30 rounded-lg p-3 border border-border">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {c.created_at ? format(new Date(c.created_at), "MMM d, h:mm a") : "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                rows={2}
                className="flex-1"
                onKeyDown={e => { if (e.key === "Enter" && e.metaKey) handlePost(); }}
              />
              <Button size="icon" onClick={handlePost} disabled={posting || !newComment.trim()} className="self-end">
                {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
