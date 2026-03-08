import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen, Brain, Loader2, CheckCircle2, AlertTriangle,
  Users, MessageSquare, Shield, Clock, Copy, RefreshCw,
} from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";

interface PlaybookTask {
  id: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium";
  assignTo: string;
  completed: boolean;
  category: "immediate" | "communication" | "monitoring" | "recovery";
}

interface PlaybookData {
  severity: "critical" | "high" | "moderate";
  summary: string;
  holdingStatement: string;
  tasks: PlaybookTask[];
  stakeholdersToNotify: string[];
  estimatedDuration: string;
}

const categoryIcons: Record<string, any> = {
  immediate: AlertTriangle,
  communication: MessageSquare,
  monitoring: Shield,
  recovery: RefreshCw,
};

const categoryLabels: Record<string, string> = {
  immediate: "Immediate Actions",
  communication: "Communications",
  monitoring: "Monitoring",
  recovery: "Recovery",
};

const priorityColors: Record<string, string> = {
  critical: "border-sentinel-red/30 text-sentinel-red bg-sentinel-red/5",
  high: "border-sentinel-amber/30 text-sentinel-amber bg-sentinel-amber/5",
  medium: "border-primary/30 text-primary bg-primary/5",
};

interface Props {
  incidentName: string;
  incidentDescription: string | null;
  mentionCount: number;
  narrativeCount: number;
}

export default function CrisisPlaybook({ incidentName, incidentDescription, mentionCount, narrativeCount }: Props) {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [playbook, setPlaybook] = useState<PlaybookData | null>(null);

  const generatePlaybook = async () => {
    if (!currentOrg) return;
    setGenerating(true);

    try {
      // Fetch approved facts for context
      const { data: facts } = await supabase
        .from("approved_facts")
        .select("title, statement_text, category")
        .eq("org_id", currentOrg.id)
        .eq("status", "approved")
        .limit(10);

      // Fetch internal contacts for assignment
      const { data: contacts } = await supabase
        .from("internal_contacts")
        .select("name, department, role_title, is_department_lead")
        .eq("org_id", currentOrg.id);

      const prompt = `You are a crisis communications expert. Generate a crisis response playbook for this incident.

Incident: "${incidentName}"
Description: "${incidentDescription || "No description"}"
Linked mentions: ${mentionCount}
Linked narratives: ${narrativeCount}
Organization: "${currentOrg.name}"

Available approved facts for responses:
${(facts || []).map(f => `- [${f.category}] ${f.title}: ${f.statement_text}`).join("\n")}

Internal contacts available:
${(contacts || []).map(c => `- ${c.name} (${c.role_title || c.department || "Team"}${c.is_department_lead ? ", Lead" : ""})`).join("\n")}

Return a JSON object with:
{
  "severity": "critical" | "high" | "moderate",
  "summary": "Brief assessment of the crisis (2-3 sentences)",
  "holdingStatement": "A draft holding statement the org can use immediately (3-4 sentences, professional tone, references approved facts where relevant)",
  "tasks": [
    {
      "id": "task-1",
      "title": "Short task title",
      "description": "What to do and why",
      "priority": "critical" | "high" | "medium",
      "assignTo": "Role or person name from contacts",
      "completed": false,
      "category": "immediate" | "communication" | "monitoring" | "recovery"
    }
  ],
  "stakeholdersToNotify": ["List of stakeholder roles to notify"],
  "estimatedDuration": "Estimated time to resolve (e.g., '24-48 hours')"
}

Generate 6-10 actionable tasks across all categories. Use real contact names when available.`;

      const { data, error } = await supabase.functions.invoke("generate-ai-summary", {
        body: { prompt, type: "crisis-playbook" },
      });

      if (error) throw error;

      const text = data?.summary || data?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setPlaybook(parsed);
      } else {
        // Fallback playbook
        setPlaybook({
          severity: mentionCount > 10 ? "critical" : mentionCount > 5 ? "high" : "moderate",
          summary: `Active incident "${incidentName}" with ${mentionCount} linked mentions and ${narrativeCount} narratives. Requires coordinated response.`,
          holdingStatement: `We are aware of the concerns being raised regarding ${incidentName}. Our team is actively investigating the situation and we are committed to providing transparent updates as more information becomes available. We take all feedback seriously and are working diligently to address any issues.`,
          tasks: [
            { id: "t1", title: "Assess scope and impact", description: "Review all linked mentions and narratives to understand the full scope of the crisis.", priority: "critical", assignTo: "Communications Lead", completed: false, category: "immediate" },
            { id: "t2", title: "Activate crisis team", description: "Notify all relevant stakeholders and assemble the crisis response team.", priority: "critical", assignTo: "Executive Team", completed: false, category: "immediate" },
            { id: "t3", title: "Draft public statement", description: "Prepare a public-facing statement using approved facts and templates.", priority: "high", assignTo: "PR Team", completed: false, category: "communication" },
            { id: "t4", title: "Monitor social channels", description: "Increase monitoring frequency on all active sources to track sentiment changes.", priority: "high", assignTo: "Social Media Team", completed: false, category: "monitoring" },
            { id: "t5", title: "Prepare FAQ document", description: "Create an internal FAQ for customer-facing teams based on approved facts.", priority: "medium", assignTo: "Support Lead", completed: false, category: "communication" },
            { id: "t6", title: "Schedule follow-up review", description: "Plan a 24-hour follow-up to assess response effectiveness and adjust strategy.", priority: "medium", assignTo: "Crisis Lead", completed: false, category: "recovery" },
          ],
          stakeholdersToNotify: ["CEO", "VP Communications", "Legal Team", "Customer Support Lead"],
          estimatedDuration: "24-48 hours",
        });
      }
    } catch (err: any) {
      toast({ title: "Playbook generated with defaults", description: "Using template-based playbook." });
      // Use fallback
      setPlaybook({
        severity: "high",
        summary: `Crisis playbook for "${incidentName}". Review and customize tasks below.`,
        holdingStatement: `We are aware of the situation regarding ${incidentName} and are actively investigating. We will provide updates as more information becomes available.`,
        tasks: [
          { id: "t1", title: "Assess situation scope", description: "Review all linked mentions.", priority: "critical", assignTo: "Crisis Lead", completed: false, category: "immediate" },
          { id: "t2", title: "Notify stakeholders", description: "Alert leadership team.", priority: "critical", assignTo: "Executive Team", completed: false, category: "immediate" },
          { id: "t3", title: "Draft response", description: "Prepare holding statement.", priority: "high", assignTo: "PR Team", completed: false, category: "communication" },
          { id: "t4", title: "Increase monitoring", description: "Boost scan frequency.", priority: "high", assignTo: "Operations", completed: false, category: "monitoring" },
        ],
        stakeholdersToNotify: ["Leadership", "Legal", "PR", "Support"],
        estimatedDuration: "24-48 hours",
      });
    } finally {
      setGenerating(false);
    }
  };

  const toggleTask = (taskId: string) => {
    if (!playbook) return;
    setPlaybook({
      ...playbook,
      tasks: playbook.tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t),
    });
  };

  const copyStatement = () => {
    if (!playbook) return;
    navigator.clipboard.writeText(playbook.holdingStatement);
    toast({ title: "Copied to clipboard" });
  };

  const completedCount = playbook?.tasks.filter(t => t.completed).length || 0;
  const totalTasks = playbook?.tasks.length || 0;

  if (!playbook) {
    return (
      <Card className="bg-card border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-card-foreground flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            AI Crisis Playbook
            <InfoTooltip text="Auto-generates a step-by-step crisis response plan with task assignments, holding statements, and stakeholder notifications." />
          </h3>
        </div>
        <div className="text-center py-6">
          <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            Generate an AI-powered crisis response plan based on this incident's data
          </p>
          <Button onClick={generatePlaybook} disabled={generating} className="gap-1.5">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {generating ? "Generating Playbook..." : "Generate Crisis Playbook"}
          </Button>
        </div>
      </Card>
    );
  }

  const categories = ["immediate", "communication", "monitoring", "recovery"];

  return (
    <Card className="bg-card border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-card-foreground flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          Crisis Playbook
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] capitalize ${priorityColors[playbook.severity]}`}>
            {playbook.severity} severity
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {completedCount}/{totalTasks} done
          </Badge>
          <Button size="sm" variant="ghost" onClick={generatePlaybook} disabled={generating} className="h-7 gap-1">
            <RefreshCw className={`h-3 w-3 ${generating ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs text-muted-foreground">{playbook.summary}</p>

      {/* Holding Statement */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-card-foreground flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-primary" />
            Holding Statement
          </span>
          <Button size="sm" variant="ghost" onClick={copyStatement} className="h-6 gap-1 text-[10px]">
            <Copy className="h-3 w-3" /> Copy
          </Button>
        </div>
        <p className="text-xs text-muted-foreground italic leading-relaxed">"{playbook.holdingStatement}"</p>
      </div>

      {/* Tasks by category */}
      {categories.map(cat => {
        const tasks = playbook.tasks.filter(t => t.category === cat);
        if (tasks.length === 0) return null;
        const CatIcon = categoryIcons[cat] || Shield;
        return (
          <div key={cat} className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <CatIcon className="h-3 w-3" />
              {categoryLabels[cat]}
            </h4>
            {tasks.map(task => (
              <div
                key={task.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                  task.completed ? "bg-muted/30 border-border opacity-60" : "bg-card border-border hover:border-primary/20"
                }`}
              >
                <Checkbox
                  checked={task.completed}
                  onCheckedChange={() => toggleTask(task.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${task.completed ? "line-through text-muted-foreground" : "text-card-foreground"}`}>
                      {task.title}
                    </span>
                    <Badge variant="outline" className={`text-[8px] ${priorityColors[task.priority]}`}>
                      {task.priority}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                  <span className="text-[10px] text-primary mt-1 flex items-center gap-1">
                    <Users className="h-2.5 w-2.5" /> {task.assignTo}
                  </span>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <Separator />

      {/* Stakeholders & Duration */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="h-3 w-3" />
          Notify: {playbook.stakeholdersToNotify.join(", ")}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          Est: {playbook.estimatedDuration}
        </span>
      </div>
    </Card>
  );
}
