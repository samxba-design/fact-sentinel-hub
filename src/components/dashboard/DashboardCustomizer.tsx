import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Settings2, ChevronUp, ChevronDown, RotateCcw } from "lucide-react";
import type { DashboardWidget } from "@/hooks/useDashboardLayout";

interface Props {
  widgets: DashboardWidget[];
  onToggle: (id: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onReset: () => void;
}

export default function DashboardCustomizer({ widgets, onToggle, onMove, onReset }: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 h-9">
          <Settings2 className="h-3.5 w-3.5" /> Customize
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle className="text-foreground">Customize Dashboard</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-1">
          {widgets.map((w, i) => (
            <div key={w.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
              <Switch checked={w.visible} onCheckedChange={() => onToggle(w.id)} className="shrink-0" />
              <span className="text-sm text-foreground flex-1">{w.label}</span>
              <div className="flex gap-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  disabled={i === 0}
                  onClick={() => onMove(w.id, "up")}
                >
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  disabled={i === widgets.length - 1}
                  onClick={() => onMove(w.id, "down")}
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="mt-4 gap-1.5 text-muted-foreground" onClick={onReset}>
          <RotateCcw className="h-3 w-3" /> Reset to Default
        </Button>
      </SheetContent>
    </Sheet>
  );
}
