import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";

interface Export {
  id: string;
  type: string;
  sheet_id: string | null;
  last_exported_at: string | null;
}

export default function ExportsPage() {
  const { currentOrg } = useOrg();
  const [exports_, setExports] = useState<Export[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    supabase
      .from("exports")
      .select("id, type, sheet_id, last_exported_at")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setExports(data || []);
        setLoading(false);
      });
  }, [currentOrg]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exports</h1>
          <p className="text-sm text-muted-foreground mt-1">Google Sheets exports and download history</p>
        </div>
        <Button><Download className="h-4 w-4 mr-2" />New Export</Button>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
        ) : exports_.length === 0 ? (
          <Card className="bg-card border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No exports yet. Export scan results or incidents from their respective pages.</p>
          </Card>
        ) : (
          exports_.map(e => (
            <Card key={e.id} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <FileSpreadsheet className="h-5 w-5 text-sentinel-emerald" />
                  <div>
                    <div className="text-sm font-medium text-card-foreground">{e.type}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      {e.last_exported_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {new Date(e.last_exported_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] ${
                  e.last_exported_at ? "border-sentinel-emerald/30 text-sentinel-emerald" : "border-muted-foreground/30 text-muted-foreground"
                }`}>
                  {e.last_exported_at ? "completed" : "pending"}
                </Badge>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
