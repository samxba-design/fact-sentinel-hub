import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, TrendingUp, Zap, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface Prediction {
  overall_risk_prediction: number;
  viral_probability: number;
  escalation_likelihood: number;
  predicted_volume_change: number;
  risk_factors: { factor: string; severity: string; probability: number }[];
  recommendations: string[];
  narrative_predictions: { narrative: string; prediction: string; viral_risk: number }[];
  confidence: number;
  time_horizon: string;
  computed_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: "text-sentinel-emerald border-sentinel-emerald/30",
  medium: "text-sentinel-amber border-sentinel-amber/30",
  high: "text-sentinel-red border-sentinel-red/30",
  critical: "text-sentinel-red border-sentinel-red/50",
};

function ScoreRing({ value, label, color }: { value: number; label: string; color: string }) {
  const circumference = 2 * Math.PI * 32;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width="80" height="80" className="-rotate-90">
        <circle cx="40" cy="40" r="32" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" opacity="0.3" />
        <motion.circle
          cx="40" cy="40" r="32" fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <motion.span
        className="text-lg font-bold font-mono -mt-14 mb-6"
        style={{ color }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        {value}%
      </motion.span>
      <span className="text-[10px] text-muted-foreground text-center">{label}</span>
    </div>
  );
}

export default function PredictiveRiskWidget() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(false);

  const runPrediction = async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("predict-risk", {
        body: { org_id: currentOrg.id },
      });
      if (error) throw error;
      setPrediction(data);
      toast({ title: "Risk prediction complete", description: `Confidence: ${data.confidence}%` });
    } catch (err: any) {
      toast({ title: "Prediction failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!prediction) {
    return (
      <Card className="bg-card border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-card-foreground flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" /> Predictive Risk Scoring
          </h3>
        </div>
        <div className="text-center py-8">
          <Brain className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            AI-powered risk forecasting that predicts viral probability and escalation risk for the next 48 hours
          </p>
          <Button onClick={runPrediction} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {loading ? "Analyzing..." : "Run Prediction"}
          </Button>
        </div>
      </Card>
    );
  }

  const riskColor = prediction.overall_risk_prediction < 30
    ? "hsl(var(--sentinel-emerald))"
    : prediction.overall_risk_prediction < 60
      ? "hsl(var(--sentinel-amber))"
      : "hsl(var(--sentinel-red))";

  return (
    <Card className="bg-card border-border p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-medium text-card-foreground flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" /> Predictive Risk — Next {prediction.time_horizon}
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px]">
            {prediction.confidence}% confidence
          </Badge>
          <Button size="sm" variant="ghost" onClick={runPrediction} disabled={loading} className="h-7 w-7 p-0">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Score rings */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <ScoreRing value={prediction.overall_risk_prediction} label="Overall Risk" color={riskColor} />
        <ScoreRing value={prediction.viral_probability} label="Viral Probability" color="hsl(var(--sentinel-amber))" />
        <ScoreRing value={prediction.escalation_likelihood} label="Escalation Risk" color="hsl(var(--sentinel-purple))" />
      </div>

      {/* Volume prediction */}
      <div className="flex items-center justify-center gap-2 mb-6 p-3 rounded-lg bg-muted/50">
        <TrendingUp className={`h-4 w-4 ${prediction.predicted_volume_change > 0 ? "text-sentinel-amber" : "text-sentinel-emerald"}`} />
        <span className="text-sm text-card-foreground">
          Predicted volume change: <strong className={prediction.predicted_volume_change > 0 ? "text-sentinel-amber" : "text-sentinel-emerald"}>
            {prediction.predicted_volume_change > 0 ? "+" : ""}{prediction.predicted_volume_change}%
          </strong>
        </span>
      </div>

      {/* Risk factors */}
      {prediction.risk_factors?.length > 0 && (
        <div className="mb-5">
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Risk Factors</h4>
          <div className="space-y-1.5">
            {prediction.risk_factors.slice(0, 4).map((rf, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <span className="text-xs text-card-foreground">{rf.factor}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground">{rf.probability}%</span>
                  <Badge variant="outline" className={`text-[9px] capitalize ${SEVERITY_COLORS[rf.severity] || ""}`}>
                    {rf.severity}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Narrative predictions */}
      {prediction.narrative_predictions?.length > 0 && (
        <div className="mb-5">
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Narrative Forecasts</h4>
          <div className="space-y-1.5">
            {prediction.narrative_predictions.slice(0, 3).map((np, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <span className="text-xs text-card-foreground truncate max-w-[200px]">{np.narrative}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[9px] capitalize ${
                    np.prediction === "growing" ? "border-sentinel-red/30 text-sentinel-red" :
                    np.prediction === "declining" ? "border-sentinel-emerald/30 text-sentinel-emerald" : ""
                  }`}>{np.prediction}</Badge>
                  {np.viral_risk > 50 && <Zap className="h-3 w-3 text-sentinel-amber" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {prediction.recommendations?.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">AI Recommendations</h4>
          <ul className="space-y-1">
            {prediction.recommendations.slice(0, 3).map((r, i) => (
              <li key={i} className="text-xs text-card-foreground flex items-start gap-2 p-1.5">
                <span className="text-primary mt-0.5">•</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
