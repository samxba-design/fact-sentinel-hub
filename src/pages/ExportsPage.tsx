import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, Clock } from "lucide-react";

const mockExports = [
  { type: "Scan Run", name: "Feb 9–16 Full Scan", status: "completed", lastExported: "Feb 16, 2026 10:30", rows: 342 },
  { type: "Selection", name: "Emergency mentions Feb 2026", status: "completed", lastExported: "Feb 15, 2026 14:00", rows: 12 },
  { type: "Incident", name: "Security Breach Post-Mortem", status: "pending", lastExported: null, rows: 0 },
];

export default function ExportsPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exports</h1>
          <p className="text-sm text-muted-foreground mt-1">Google Sheets exports and download history</p>
        </div>
        <Button>
          <Download className="h-4 w-4 mr-2" />
          New Export
        </Button>
      </div>

      <div className="space-y-3">
        {mockExports.map((e, i) => (
          <Card key={i} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <FileSpreadsheet className="h-5 w-5 text-sentinel-emerald" />
                <div>
                  <div className="text-sm font-medium text-card-foreground">{e.name}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{e.type}</Badge>
                    {e.lastExported && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {e.lastExported}
                      </span>
                    )}
                    {e.rows > 0 && <span>{e.rows} rows</span>}
                  </div>
                </div>
              </div>
              <Badge variant="outline" className={`text-[10px] ${
                e.status === "completed" ? "border-sentinel-emerald/30 text-sentinel-emerald" : "border-muted-foreground/30 text-muted-foreground"
              }`}>
                {e.status}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
