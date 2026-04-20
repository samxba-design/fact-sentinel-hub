import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Link2, Search, Plus, Trash2, Loader2, ExternalLink,
  GitBranch, AlertTriangle, MessageSquare, RefreshCw, X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import SourceBadge from "@/components/SourceBadge";

interface RelatedMention {
  id: string;
  relation: string;
  related_id: string;
  mention: {
    id: string;
    content: string;
    source: string;
    url: string | null;
    title: string | null;
    severity: string | null;
    sentiment_label: string | null;
    author_name: string | null;
    posted_at: string | null;
  };
}

interface RelatedMentionsPanelProps {
  mentionId: string;
  orgId: string;
}

const RELATION_TYPES = [
  { value: "related",       label: "Related",        icon: <Link2 className="h-3 w-3" /> },
  { value: "same_story",    label: "Same story",     icon: <GitBranch className="h-3 w-3" /> },
  { value: "amplification", label: "Amplification",  icon: <RefreshCw className="h-3 w-3" /> },
  { value: "response",      label: "Response",       icon: <MessageSquare className="h-3 w-3" /> },
  { value: "contradiction", label: "Contradiction",  icon: <AlertTriangle className="h-3 w-3" /> },
];

const RELATION_STYLES: Record<string, string> = {
  related:       "text-muted-foreground border-border",
  same_story:    "text-primary border-primary/30",
  amplification: "text-sentinel-amber border-sentinel-amber/30",
  response:      "text-blue-400 border-blue-400/30",
  contradiction: "text-sentinel-red border-sentinel-red/30",
};

export default function RelatedMentionsPanel({ mentionId, orgId }: RelatedMentionsPanelProps) {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [related, setRelated] = useState<RelatedMention[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRelation, setSelectedRelation] = useState("related");
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadRelated() {
    const { data } = await supabase
      .from("related_mentions" as any)
      .select(`
        id, relation, related_id,
        mention:mentions!related_mentions_related_id_fkey(
          id, content, source, url, title, severity, sentiment_label, author_name, posted_at
        )
      `)
      .eq("mention_id", mentionId);
    setRelated((data as RelatedMention[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { loadRelated(); }, [mentionId]);

  async function searchMentions(q: string) {
    if (!q.trim() || q.length < 3) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data } = await supabase
        .from("mentions")
        .select("id, content, source, url, title, severity, sentiment_label, author_name, posted_at")
        .eq("org_id", orgId)
        .neq("id", mentionId)
        .textSearch("content", q, { type: "plain" })
        .order("posted_at", { ascending: false })
        .limit(10);
      setSearchResults(data ?? []);
    } catch {}
    setSearching(false);
  }

  useEffect(() => {
    const timer = setTimeout(() => searchMentions(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  async function linkMention(targetId: string) {
    if (!currentOrg) return;
    setLinkingId(targetId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Create bidirectional link
      await supabase.from("related_mentions" as any).upsert([
        { org_id: currentOrg.id, mention_id: mentionId, related_id: targetId, relation: selectedRelation, created_by: user?.id },
        { org_id: currentOrg.id, mention_id: targetId, related_id: mentionId, relation: selectedRelation, created_by: user?.id },
      ], { onConflict: "mention_id,related_id" });
      await loadRelated();
      setSearchOpen(false);
      setSearchQuery("");
      toast({ title: "Linked", description: "Mentions linked successfully." });
    } catch (e: any) {
      toast({ title: "Link failed", description: e.message, variant: "destructive" });
    } finally {
      setLinkingId(null);
    }
  }

  async function unlinkMention(relId: string, relatedId: string) {
    setDeletingId(relId);
    try {
      await supabase.from("related_mentions" as any).delete().eq("id", relId);
      // Also remove the reverse link
      await supabase.from("related_mentions" as any)
        .delete()
        .eq("mention_id", relatedId)
        .eq("related_id", mentionId);
      setRelated(r => r.filter(x => x.id !== relId));
    } catch (e: any) {
      toast({ title: "Unlink failed", description: e.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  const snippetText = (m: any) =>
    (m.title || m.content || "").replace(/TITLE:\s*/i, "").replace(/TRANSCRIPT:\s*/i, "").slice(0, 120);

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : related.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2 text-center">
          No linked mentions yet. Connect related stories, amplifications, or responses.
        </p>
      ) : (
        <div className="space-y-2">
          {related.map(r => (
            <div key={r.id} className={`rounded-lg border p-3 text-xs ${RELATION_STYLES[r.relation] ?? RELATION_STYLES.related}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Badge variant="outline" className={`text-[10px] capitalize border-current ${RELATION_STYLES[r.relation] ?? ""}`}>
                      {r.relation.replace("_", " ")}
                    </Badge>
                    <SourceBadge source={r.mention.source} />
                    {r.mention.posted_at && (
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(r.mention.posted_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-foreground cursor-pointer hover:underline truncate"
                    onClick={() => navigate(`/mentions/${r.mention.id}`)}
                  >
                    {snippetText(r.mention)}…
                  </p>
                  {r.mention.author_name && (
                    <p className="text-muted-foreground mt-0.5">by {r.mention.author_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {r.mention.url && (
                    <a href={r.mention.url} target="_blank" rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground p-0.5">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <button
                    onClick={() => unlinkMention(r.id, r.related_id)}
                    disabled={deletingId === r.id}
                    className="text-muted-foreground hover:text-sentinel-red p-0.5 transition-colors"
                  >
                    {deletingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Link button + dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Link a mention
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Link a related mention</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search mentions by content…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs"
                  autoFocus
                />
              </div>
              <Select value={selectedRelation} onValueChange={setSelectedRelation}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATION_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      <span className="flex items-center gap-1.5">{t.icon}{t.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {searching ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : searchResults.length === 0 && searchQuery.length >= 3 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No matching mentions found</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {searchResults.map(m => (
                  <div key={m.id}
                    className="flex items-start gap-2 p-2.5 rounded-md border border-border hover:border-primary/30 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => linkMention(m.id)}
                  >
                    <SourceBadge source={m.source} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{snippetText(m)}…</p>
                      {m.author_name && <p className="text-[10px] text-muted-foreground">{m.author_name}</p>}
                    </div>
                    {linkingId === m.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0 text-primary" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
            )}
            {searchQuery.length < 3 && (
              <p className="text-[10px] text-muted-foreground text-center">Type at least 3 characters to search</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
