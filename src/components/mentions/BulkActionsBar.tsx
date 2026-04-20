import { Button } from "@/components/ui/button";
import { EyeOff, Clock, CheckCircle2, Siren, Trash2, X, RefreshCw } from "lucide-react";

interface BulkActionsBarProps {
  selectedCount: number;
  onAction: (action: string) => void;
  onClear: () => void;
  rescanning?: boolean;
}

export default function BulkActionsBar({ selectedCount, onAction, onClear, rescanning = false }: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 animate-fade-up">
      <span className="text-sm font-medium text-primary">{selectedCount} selected</span>
      <div className="flex-1" />
      <Button
        size="sm" variant="outline"
        onClick={() => onAction("rescan")}
        disabled={rescanning}
        className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
        title="Re-scrape source and re-run AI analysis. YouTube uses Gemini native video understanding."
      >
        <RefreshCw className={`h-3 w-3 ${rescanning ? "animate-spin" : ""}`} />
        {rescanning ? "Rescanning…" : "Rescan"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAction("ignored")} className="h-7 text-xs gap-1.5">
        <EyeOff className="h-3 w-3" /> Ignore
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAction("snoozed")} className="h-7 text-xs gap-1.5">
        <Clock className="h-3 w-3" /> Snooze
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAction("resolved")} className="h-7 text-xs gap-1.5">
        <CheckCircle2 className="h-3 w-3" /> Resolve
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAction("escalate")} className="h-7 text-xs gap-1.5">
        <Siren className="h-3 w-3" /> Escalate
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAction("delete")} className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive">
        <Trash2 className="h-3 w-3" /> Delete
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear} className="h-7 w-7 p-0">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
