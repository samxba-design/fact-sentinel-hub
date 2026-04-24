import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Key, Plus, X, Loader2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import InfoTooltip from "@/components/InfoTooltip";

// Re-use TabInfoBanner from parent (inline here)
function TabInfoBanner({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4 rounded-lg bg-primary/5 border border-primary/15">
      <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div className="space-y-1 text-xs text-primary/80">
        <p className="font-semibold text-sm text-primary">{title}</p>
        {children}
      </div>
    </div>
  );
}

interface Keyword {
  id: string;
  type: string;
  value: string;
  locked: boolean;
}

export default function KeywordsTab() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKwValue, setNewKwValue] = useState("");
  const [newKwType, setNewKwType] = useState("brand");
  const [addingKw, setAddingKw] = useState(false);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    supabase.from("keywords").select("id, type, value, locked").eq("org_id", currentOrg.id).order("type")
      .then(({ data }) => {
        setKeywords((data as Keyword[]) || []);
        setLoading(false);
      });
  }, [currentOrg]);

  const addKeyword = async () => {
    if (!currentOrg || !newKwValue.trim()) return;
    setAddingKw(true);
    const { data, error } = await supabase.from("keywords")
      .insert({ org_id: currentOrg.id, type: newKwType, value: newKwValue.trim() })
      .select("id, type, value, locked")
      .single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setKeywords(prev => [...prev, data as Keyword]);
      setNewKwValue("");
    }
    setAddingKw(false);
  };

  const deleteKeyword = async (kw: Keyword) => {
    const { error } = await supabase.from("keywords").delete().eq("id", kw.id);
    if (!error) setKeywords(prev => prev.filter(k => k.id !== kw.id));
    else toast({ title: "Error", description: error.message, variant: "destructive" });
  };

  const groupedKeywords = keywords.reduce<Record<string, Keyword[]>>((acc, k) => {
    if (!acc[k.type]) acc[k.type] = [];
    acc[k.type].push(k);
    return acc;
  }, {});

  return (
    <Card className="bg-card border-border p-6 space-y-5">
      <TabInfoBanner icon={Info} title="How keywords work">
        <p>Keywords are the search terms SentiWatch uses to find mentions of your brand online. When you run a scan, every source is searched for these keywords. Add your <strong>brand name</strong>, <strong>product names</strong>, <strong>executive names</strong>, <strong>competitors</strong>, and common <strong>misspellings or aliases</strong>.</p>
        <p className="mt-1">💡 <strong>Tip:</strong> The more specific your keywords, the less noise you'll get. "Acme Corp" is better than just "Acme".</p>
      </TabInfoBanner>

      <h3 className="text-sm font-medium text-card-foreground">Keywords & Aliases</h3>

      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            Type
            <InfoTooltip text="Brand = your company name. Product = product/service names. Competitor = rival brands to track. Executive = key people. Alias = alternate spellings or abbreviations." />
          </Label>
          <Select value={newKwType} onValueChange={setNewKwType}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="brand">Brand</SelectItem>
              <SelectItem value="product">Product</SelectItem>
              <SelectItem value="competitor">Competitor</SelectItem>
              <SelectItem value="executive">Executive</SelectItem>
              <SelectItem value="alias">Alias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs text-muted-foreground">Keyword</Label>
          <Input
            placeholder={newKwType === "brand" ? "e.g. Acme Corp" : newKwType === "product" ? "e.g. Acme Pro Suite" : newKwType === "competitor" ? "e.g. RivalCo" : newKwType === "executive" ? "e.g. Jane Smith CEO" : "e.g. AcmeCo, @acme"}
            value={newKwValue}
            onChange={e => setNewKwValue(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addKeyword()}
          />
        </div>
        <Button size="sm" onClick={addKeyword} disabled={addingKw || !newKwValue.trim()}>
          {addingKw ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
          Add
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-20 w-full" />
      ) : Object.keys(groupedKeywords).length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <Key className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">No keywords configured yet.</p>
          <p className="text-xs text-muted-foreground">Add your brand name above to start tracking mentions across the web.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedKeywords).map(([type, kws]) => (
            <div key={type} className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">{type}</Label>
              <div className="flex flex-wrap gap-2">
                {kws.map(k => (
                  <Badge key={k.id} variant="secondary" className="text-xs pl-2 pr-1 py-1 flex items-center gap-1.5">
                    {k.value}
                    {!k.locked && (
                      <button onClick={() => deleteKeyword(k)} className="hover:text-destructive transition-colors p-0.5 rounded">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
