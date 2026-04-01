import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Download, FileSpreadsheet, Clock, Loader2, CheckCircle2, Table2,
  RefreshCw, Sheet, LogIn, LogOut, Mail, FileText, BarChart3, Share2, Brain, Plus, ExternalLink
} from "lucide-react";
import PageGuide from "@/components/PageGuide";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import UpgradeBanner from "@/components/UpgradeBanner";
import EmptyState from "@/components/EmptyState";
import ReportGeneratorDialog from "@/components/reports/ReportGeneratorDialog";

interface ExportRecord {
  id: string;
  type: string;
  sheet_id: string | null;
  last_exported_at: string | null;
}

interface GoogleToken {
  id: string;
  google_email: string | null;
  token_expires_at: string;
}

type DataType = "mentions" | "narratives" | "incidents" | "escalations" | "facts" | "people";
type ExportMode = "csv" | "sheets" | "pdf";

const DATA_TYPES: { value: DataType; label: string; description: string }[] = [
  { value: "mentions", label: "Mentions", description: "All detected mentions with sentiment, source, severity" },
  { value: "narratives", label: "Narratives", description: "Tracked narratives with confidence and status" },
  { value: "incidents", label: "Incidents", description: "Incident records with timeline and stakeholders" },
  { value: "escalations", label: "Escalations", description: "Escalation tickets with priority and department" },
  { value: "facts", label: "Approved Facts", description: "Governance library facts with categories and status" },
  { value: "people", label: "People", description: "Monitored people with tiers and social handles" },
];

export default function ExportsPage() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [exports_, setExports] = useState<ExportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetId, setSheetId] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<DataType[]>(["mentions"]);
  const [exporting, setExporting] = useState<string | null>(null);
  const [mode, setMode] = useState<ExportMode>("csv");
  const [googleToken, setGoogleToken] = useState<GoogleToken | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [summaryStats, setSummaryStats] = useState<Record<string, number>>({});
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [newSheetUrl, setNewSheetUrl] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("google_connected") === "true") {
      toast({ title: "Google Connected", description: "Your Google account is now linked for Sheets export." });
      searchParams.delete("google_connected");
      setSearchParams(searchParams, { replace: true });
      setMode("sheets");
    }
    if (searchParams.get("google_error")) {
      toast({ title: "Google Connection Failed", description: `Error: ${searchParams.get("google_error")}`, variant: "destructive" });
      searchParams.delete("google_error");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!currentOrg || !user) return;
    setLoading(true);

    const [exportsRes, tokenRes, mentionsCount, narrativesCount, incidentsCount, escalationsCount, factsCount] = await Promise.all([
      supabase.from("exports").select("id, type, sheet_id, last_exported_at")
        .eq("org_id", currentOrg.id).order("last_exported_at", { ascending: false }).limit(50),
      supabase.from("user_google_tokens").select("id, google_email, token_expires_at")
        .eq("user_id", user.id).eq("org_id", currentOrg.id).maybeSingle(),
      supabase.from("mentions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id).eq("mention_type", "brand"),
      supabase.from("narratives").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id),
      supabase.from("incidents").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id),
      supabase.from("escalations").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id),
      supabase.from("approved_facts").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id),
    ]);

    setExports(exportsRes.data || []);
    setGoogleToken(tokenRes.data || null);
    setSummaryStats({
      mentions: mentionsCount.count || 0,
      narratives: narrativesCount.count || 0,
      incidents: incidentsCount.count || 0,
      escalations: escalationsCount.count || 0,
      facts: factsCount.count || 0,
    });

    const withSheet = (exportsRes.data || []).find(e => e.sheet_id);
    if (withSheet?.sheet_id && !sheetId) setSheetId(withSheet.sheet_id);
    setLoading(false);
  }, [currentOrg, user]);

  useEffect(() => { loadData(); }, [loadData]);

  const connectGoogle = async () => {
    if (!currentOrg || !user) return;
    setConnectingGoogle(true);
    try {
      const redirectUri = `${window.location.origin}/exports|${user.id}|${currentOrg.id}`;
      const { data, error } = await supabase.functions.invoke("google-sheets-auth", { body: { redirect_uri: redirectUri } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setConnectingGoogle(false);
    }
  };

  const disconnectGoogle = async () => {
    if (!googleToken) return;
    await supabase.from("user_google_tokens").delete().eq("id", googleToken.id);
    setGoogleToken(null);
    toast({ title: "Disconnected", description: "Google account unlinked." });
  };

  const createNewSheet = async () => {
    if (!currentOrg || !user) return;
    setCreatingSheet(true);
    setNewSheetUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke("create-google-sheet", {
        body: { org_id: currentOrg.id, auto_populate: true },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setSheetId(data.sheet_id);
      setNewSheetUrl(data.sheet_url);
      const desc = data.populated_tabs?.length > 0
        ? `Created & populated: ${data.populated_tabs.join(", ")}`
        : `"${data.title}" created. Use Sync to populate tabs.`;
      toast({ title: "Sheet Created!", description: desc });
      loadData();
    } catch (err: any) {
      toast({ title: "Error creating sheet", description: err.message, variant: "destructive" });
    } finally {
      setCreatingSheet(false);
    }
  };

  const toggleType = (dt: DataType) => {
    setSelectedTypes(prev => prev.includes(dt) ? prev.filter(t => t !== dt) : [...prev, dt]);
  };

  const handleExport = async (dataType: DataType) => {
    if (!currentOrg) return;
    setExporting(dataType);
    try {
      if (mode === "csv") {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-data`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ org_id: currentOrg.id, data_type: dataType, mode: "csv" }),
          }
        );
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Export failed"); }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${dataType}_export_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "CSV Downloaded", description: `${dataType} export ready.` });
      } else {
        if (!sheetId.trim()) {
          toast({
            title: "Missing Sheet ID",
            description: "Enter your Google Sheet ID above. You can find it in the sheet URL: docs.google.com/spreadsheets/d/SHEET_ID/edit",
            variant: "destructive",
          });
          // Scroll the sheet ID input into view
          document.getElementById("sheet-id-input")?.focus();
          setExporting(null);
          return;
        }
        if (!googleToken) { toast({ title: "Not Connected", variant: "destructive" }); setExporting(null); return; }
        const { data, error } = await supabase.functions.invoke("export-data", {
          body: { org_id: currentOrg.id, data_type: dataType, mode: "sheets", sheet_id: sheetId.trim() },
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        toast({ title: "Sheet Updated", description: data.message });
        loadData();
      }
    } catch (err: any) {
      toast({ title: "Export Error", description: err.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleExportAll = async () => {
    for (const dt of selectedTypes) { await handleExport(dt); }
  };

  return (
    <div className="space-y-6 animate-fade-up max-w-4xl">
      <UpgradeBanner feature="Data Exports" className="mb-2" />
      <div className="flex items-center justify-between">
      <div>
          <h1 className="text-2xl font-bold text-foreground">Exports</h1>
          <p className="text-sm text-muted-foreground mt-1">Export data as CSV, sync to Google Sheets, or generate PDF reports</p>
        </div>
      </div>

      <PageGuide
        title="How Exports Work"
        subtitle="Get your data out — CSV downloads, live Sheets sync, or AI-powered PDF reports"
        steps={[
          {
            icon: <Download className="h-4 w-4 text-primary" />,
            title: "CSV Download",
            description: "Instantly download any data type as a CSV file. No setup required — select data types and click download.",
          },
          {
            icon: <Sheet className="h-4 w-4 text-primary" />,
            title: "Google Sheets Sync",
            description: "Connect your Google account and sync data directly to a spreadsheet. Great for live dashboards and team sharing.",
          },
          {
            icon: <Brain className="h-4 w-4 text-primary" />,
            title: "PDF Reports",
            description: "Generate AI-powered reports with executive summaries, sentiment analysis, and visual charts. Choose from Executive, Competitor, Incident, Weekly, or Full report types.",
          },
        ]}
        integrations={[
          { label: "Dashboard", to: "/dashboard", description: "Quick report generation" },
          { label: "Mentions", to: "/mentions", description: "Export mention data" },
          { label: "Settings → Integrations", to: "/settings?tab=integrations", description: "Google Sheets setup" },
        ]}
        tip="PDF reports are also accessible from the floating report button on the dashboard. Schedule weekly digests in Settings to automatically receive reports via email."
      />

      {/* Mode selector */}
      <Tabs value={mode} onValueChange={v => setMode(v as ExportMode)}>
        <TabsList className="bg-muted">
          <TabsTrigger value="csv" className="gap-2"><Download className="h-3.5 w-3.5" /> CSV Download</TabsTrigger>
          <TabsTrigger value="sheets" className="gap-2"><Sheet className="h-3.5 w-3.5" /> Google Sheets</TabsTrigger>
          <TabsTrigger value="pdf" className="gap-2"><FileText className="h-3.5 w-3.5" /> PDF Report</TabsTrigger>
        </TabsList>

        <TabsContent value="pdf" className="mt-4">
          <Card className="bg-card border-border p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-card-foreground">Generate PDF Report</h3>
                <p className="text-xs text-muted-foreground">Create a comprehensive PDF report with AI-powered insights, sentiment analysis, and visual summaries.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <ReportGeneratorDialog />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="sheets" className="mt-4 space-y-4">
          <Card className="bg-card border-border p-5">
            {googleToken ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-sentinel-emerald" />
                  <div>
                    <p className="text-sm font-medium text-card-foreground">Google Account Connected</p>
                    {googleToken.google_email && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Mail className="h-3 w-3" /> {googleToken.google_email}</p>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={disconnectGoogle}><LogOut className="h-3.5 w-3.5 mr-1.5" /> Disconnect</Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-card-foreground">Connect Google Account</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sign in with Google to export directly to your sheets</p>
                </div>
                <Button onClick={connectGoogle} disabled={connectingGoogle}>
                  {connectingGoogle ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
                  Connect Google
                </Button>
              </div>
            )}
          </Card>
          {googleToken && (
            <Card className="bg-card border-border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-foreground text-sm font-medium">Google Sheet</Label>
                <Button variant="outline" size="sm" onClick={createNewSheet} disabled={creatingSheet}>
                  {creatingSheet ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                  Create New Sheet
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Create a new sheet above, or paste an existing Sheet ID from the URL: docs.google.com/spreadsheets/d/<strong className="text-primary">THIS_PART</strong>/edit
              </p>
              <Input id="sheet-id-input" value={sheetId} onChange={e => { setSheetId(e.target.value); setNewSheetUrl(null); }}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                className="bg-muted border-border font-mono text-xs" />
              {newSheetUrl && (
                <a href={newSheetUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Open sheet in Google Sheets
                </a>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="csv" className="mt-4">
          <Card className="bg-card border-border p-5">
            <p className="text-sm text-muted-foreground">Download CSV files directly — no setup required.</p>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Data summary */}
      <Card className="bg-card border-border p-5">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" /> Available Data Summary
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {Object.entries(summaryStats).map(([key, count]) => (
            <div key={key} className="text-center">
              <p className="text-lg font-bold text-foreground">{count}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider capitalize">{key}</p>
            </div>
          ))}
        </div>
      </Card>

      {mode !== "pdf" && (
        <>
          {/* Data type selection */}
          <Card className="bg-card border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Select Data Types</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DATA_TYPES.map(dt => {
                const isSelected = selectedTypes.includes(dt.value);
                return (
                  <button key={dt.value} onClick={() => toggleType(dt.value)}
                    className={`text-left p-4 rounded-lg border transition-all ${isSelected ? "border-primary/50 bg-primary/5" : "border-border bg-muted/30 hover:border-muted-foreground/30"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-card-foreground">{dt.label}</span>
                      <Switch checked={isSelected} onCheckedChange={() => toggleType(dt.value)} />
                    </div>
                    <p className="text-xs text-muted-foreground">{dt.description}</p>
                    {summaryStats[dt.value] !== undefined && (
                      <p className="text-[10px] text-primary mt-1">{summaryStats[dt.value]} records available</p>
                    )}
                  </button>
                );
              })}
            </div>

            <Button onClick={handleExportAll}
              disabled={selectedTypes.length === 0 || !!exporting || (mode === "sheets" && !googleToken)}
              className="w-full">
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : mode === "csv" ? <Download className="h-4 w-4 mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {exporting ? `Exporting ${exporting}...` : mode === "csv"
                ? `Download ${selectedTypes.length} CSV file${selectedTypes.length !== 1 ? "s" : ""}`
                : `Sync ${selectedTypes.length} type${selectedTypes.length !== 1 ? "s" : ""} to Sheet`}
            </Button>
          </Card>

          {/* Quick single exports */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {DATA_TYPES.map(dt => (
              <Button key={dt.value} variant="outline" size="sm" className="gap-2"
                disabled={!!exporting || (mode === "sheets" && !googleToken)}
                onClick={() => handleExport(dt.value)}>
                {exporting === dt.value ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Table2 className="h-3.5 w-3.5" />}
                {dt.label}
              </Button>
            ))}
          </div>
        </>
      )}

      {/* Export history */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Export History</h3>
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
        ) : exports_.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="No exports yet"
            description="Select data types above and export to CSV or Google Sheets to get started."
          />
        ) : (
          exports_.map(e => (
            <Card key={e.id} className="bg-card border-border p-4 hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-4 w-4 text-sentinel-emerald" />
                  <div>
                    <div className="text-sm font-medium text-card-foreground capitalize">{e.type}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      {e.last_exported_at && (
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(e.last_exported_at).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] border-sentinel-emerald/30 text-sentinel-emerald">
                    <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> synced
                  </Badge>
                  {e.sheet_id && (
                    <Button size="sm" variant="ghost" onClick={() => { setSheetId(e.sheet_id!); setMode("sheets"); setSelectedTypes([e.type as DataType]); }}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
