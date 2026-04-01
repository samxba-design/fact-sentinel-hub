import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, Download, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";

interface ReportData {
  title: string;
  org_name: string;
  period_days: number;
  generated_at: string;
  stats: Record<string, any>;
  content: string;
  sections: string[];
}

const REPORT_TYPES = [
  { value: "full", label: "Full Overview", description: "Complete analysis with all sections" },
  { value: "executive", label: "Executive Summary", description: "High-level insights for leadership" },
  { value: "competitor", label: "Competitor Intel", description: "Focused competitor analysis" },
  { value: "incident", label: "Incident Report", description: "Crisis & incident summary" },
  { value: "weekly", label: "Weekly Digest", description: "Weekly performance summary" },
  { value: "custom", label: "Custom Report", description: "Choose your own sections" },
];

const ALL_SECTIONS = [
  { value: "overview", label: "Overview & Key Metrics" },
  { value: "sentiment", label: "Sentiment Analysis" },
  { value: "narratives", label: "Narrative Tracking" },
  { value: "competitors", label: "Competitor Analysis" },
  { value: "incidents", label: "Incidents & Crises" },
  { value: "escalations", label: "Escalations" },
  { value: "risks", label: "Risk Assessment" },
  { value: "recommendations", label: "Recommendations" },
];

interface Props {
  trigger?: React.ReactNode;
}

export default function ReportGeneratorDialog({ trigger }: Props) {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState("full");
  const [days, setDays] = useState("7");
  const [selectedSections, setSelectedSections] = useState<Set<string>>(
    new Set(ALL_SECTIONS.map(s => s.value))
  );
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const toggleSection = (val: string) => {
    setSelectedSections(prev => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  };

  const generateReport = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setReport(null);

    try {
      const { data, error } = await supabase.functions.invoke("generate-report", {
        body: {
          org_id: currentOrg.id,
          report_type: reportType,
          sections: reportType === "custom" ? Array.from(selectedSections) : undefined,
          days: parseInt(days),
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setReport(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const printReport = () => {
    if (!report) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const htmlContent = report.content
      .replace(/^## (.*$)/gm, '<h2 style="margin-top:24px;margin-bottom:8px;font-size:18px;font-weight:700;border-bottom:1px solid #ddd;padding-bottom:6px;">$1</h2>')
      .replace(/^### (.*$)/gm, '<h3 style="margin-top:16px;margin-bottom:6px;font-size:15px;font-weight:600;">$1</h3>')
      .replace(/^\*\*(.*?)\*\*/gm, '<strong>$1</strong>')
      .replace(/^- (.*$)/gm, '<li style="margin-left:20px;margin-bottom:4px;">$1</li>')
      .replace(/\n/g, '<br/>');

    const safeTitle = escHtml(report.title);
    const safeOrgName = escHtml(report.org_name);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${safeTitle} - ${safeOrgName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a1a; line-height: 1.6; }
          .header { border-bottom: 3px solid #e87720; padding-bottom: 16px; margin-bottom: 24px; }
          .header h1 { font-size: 24px; margin: 0; color: #1a1a1a; }
          .meta { color: #666; font-size: 13px; margin-top: 8px; }
          .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
          .stat { background: #f8f8f8; border-radius: 8px; padding: 12px; text-align: center; }
          .stat-value { font-size: 22px; font-weight: 700; color: #1a1a1a; }
          .stat-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${safeTitle}</h1>
          <div class="meta">${safeOrgName} • Last ${report.period_days} days • Generated ${new Date(report.generated_at).toLocaleDateString()}</div>
        </div>
        <div class="stats">
          <div class="stat"><div class="stat-value">${report.stats.total_mentions}</div><div class="stat-label">Mentions</div></div>
          <div class="stat"><div class="stat-value">${report.stats.risk_score}/100</div><div class="stat-label">Risk Score</div></div>
          <div class="stat"><div class="stat-value">${report.stats.active_narratives}</div><div class="stat-label">Active Narratives</div></div>
          <div class="stat"><div class="stat-value">${report.stats.emergencies}</div><div class="stat-label">Emergencies</div></div>
        </div>
        <div>${htmlContent}</div>
        <div style="margin-top:40px;padding-top:16px;border-top:1px solid #eee;color:#999;font-size:11px;">
          Generated by SentiWatch • ${new Date(report.generated_at).toLocaleString()}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const showCustomSections = reportType === "custom";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Report Generator
          </DialogTitle>
        </DialogHeader>

        {!report ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Report Type</Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map(rt => (
                      <SelectItem key={rt.value} value={rt.value}>
                        <div>
                          <span className="font-medium">{rt.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">{rt.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Time Period</Label>
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="14">Last 14 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {showCustomSections && (
              <div className="space-y-2">
                <Label className="text-sm">Sections to Include</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_SECTIONS.map(s => (
                    <label
                      key={s.value}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        selectedSections.has(s.value) ? "border-primary/50 bg-primary/5" : "border-border"
                      }`}
                    >
                      <Checkbox
                        checked={selectedSections.has(s.value)}
                        onCheckedChange={() => toggleSection(s.value)}
                      />
                      <span className="text-sm text-foreground">{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={generateReport} disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating report...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Report
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-foreground">{report.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {report.org_name} • Last {report.period_days} days • {new Date(report.generated_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setReport(null)}>
                  New Report
                </Button>
                <Button variant="outline" size="sm" onClick={printReport}>
                  <Printer className="h-3.5 w-3.5 mr-1.5" />
                  Print / PDF
                </Button>
              </div>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { label: "Mentions", value: report.stats.total_mentions },
                { label: "Risk Score", value: `${report.stats.risk_score}/100` },
                { label: "Narratives", value: report.stats.active_narratives },
                { label: "Emergencies", value: report.stats.emergencies },
              ].map(s => (
                <div key={s.label} className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Report content */}
            <div
              ref={reportRef}
              className="flex-1 overflow-y-auto prose prose-sm prose-invert max-w-none p-4 rounded-lg border border-border bg-card"
              dangerouslySetInnerHTML={{
                __html: report.content
                  .replace(/^## (.*$)/gm, '<h2 class="text-base font-bold text-foreground mt-6 mb-2 pb-1 border-b border-border">$1</h2>')
                  .replace(/^### (.*$)/gm, '<h3 class="text-sm font-semibold text-foreground mt-4 mb-1">$1</h3>')
                  .replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>')
                  .replace(/^- (.*$)/gm, '<li class="text-sm text-muted-foreground ml-4 mb-1">$1</li>')
                  .replace(/\n\n/g, '<br/><br/>')
                  .replace(/\n/g, '<br/>'),
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
