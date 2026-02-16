import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Bookmark, Plus, X, Save } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

interface SavedFilter {
  id: string;
  name: string;
  filters: Record<string, any>;
}

interface SavedFiltersProps {
  currentFilters: Record<string, any>;
  onApply: (filters: Record<string, any>) => void;
}

export default function SavedFilters({ currentFilters, onApply }: SavedFiltersProps) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!currentOrg || !user) return;
    supabase
      .from("saved_filters")
      .select("id, name, filters")
      .eq("org_id", currentOrg.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setFilters((data as any) || []));
  }, [currentOrg, user]);

  const saveFilter = async () => {
    if (!currentOrg || !user || !newName.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("saved_filters")
      .insert({
        org_id: currentOrg.id,
        user_id: user.id,
        name: newName.trim(),
        filters: currentFilters,
      })
      .select("id, name, filters")
      .single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setFilters((prev) => [data as any, ...prev]);
      setNewName("");
      toast({ title: "Filter saved" });
    }
    setSaving(false);
  };

  const deleteFilter = async (id: string) => {
    await supabase.from("saved_filters").delete().eq("id", id);
    setFilters((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Bookmark className="h-3.5 w-3.5" />
          Saved Views
          {filters.length > 0 && (
            <Badge variant="secondary" className="text-[10px] ml-1 px-1.5">{filters.length}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-3" align="end">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Save current view..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-7 text-xs"
            onKeyDown={(e) => e.key === "Enter" && saveFilter()}
          />
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={saveFilter} disabled={saving || !newName.trim()}>
            <Save className="h-3.5 w-3.5" />
          </Button>
        </div>
        {filters.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-2">No saved views yet</p>
        ) : (
          <div className="space-y-1">
            {filters.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => { onApply(f.filters); setOpen(false); }}
              >
                <span className="text-xs text-card-foreground">{f.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteFilter(f.id); }}
                  className="text-muted-foreground hover:text-destructive p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
