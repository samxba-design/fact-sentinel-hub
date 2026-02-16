import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MessageCircleReply, ShieldAlert, AlertTriangle, CheckCircle2, Ban } from "lucide-react";

export default function RespondPage() {
  const [inputText, setInputText] = useState("");
  const [platform, setPlatform] = useState("general");
  const [intent, setIntent] = useState("");
  const [result, setResult] = useState<null | { status: "blocked" | "draft"; message: string }>(null);

  const handleGenerate = () => {
    // Mock: always block since no approved facts exist yet
    setResult({
      status: "blocked",
      message: "No approved facts/templates found to safely address this claim. An escalation ticket has been created.",
    });
  };

  return (
    <div className="space-y-6 animate-fade-up max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">How To Respond</h1>
        <p className="text-sm text-muted-foreground mt-1">Strict response engine — drafts only from approved facts</p>
      </div>

      <Card className="bg-card border-border p-6 space-y-5">
        <div className="space-y-2">
          <Label className="text-foreground">Paste the post or text you need to respond to</Label>
          <Textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Paste the negative post, comment, or text here..."
            className="min-h-[120px] bg-muted border-border"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-foreground">Platform constraints</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="bg-muted border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">X (short)</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="long">Long form</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Response intent</Label>
            <Select value={intent} onValueChange={setIntent}>
              <SelectTrigger className="bg-muted border-border">
                <SelectValue placeholder="Select intent..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clarify">Clarify misinformation</SelectItem>
                <SelectItem value="support">Support issue</SelectItem>
                <SelectItem value="scam">Scam warning</SelectItem>
                <SelectItem value="outage">Outage update</SelectItem>
                <SelectItem value="regulatory">Regulatory rumor</SelectItem>
                <SelectItem value="executive">Executive rumor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={handleGenerate} disabled={!inputText || !intent} className="w-full">
          <MessageCircleReply className="h-4 w-4 mr-2" />
          Generate Approved Response
        </Button>
      </Card>

      {result && (
        <Card className={`border p-6 space-y-3 ${
          result.status === "blocked"
            ? "bg-sentinel-red/5 border-sentinel-red/20"
            : "bg-sentinel-emerald/5 border-sentinel-emerald/20"
        }`}>
          <div className="flex items-center gap-3">
            {result.status === "blocked" ? (
              <>
                <Ban className="h-5 w-5 text-sentinel-red" />
                <span className="text-sm font-medium text-sentinel-red">Response Blocked</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-sentinel-emerald" />
                <span className="text-sm font-medium text-sentinel-emerald">Draft Generated</span>
              </>
            )}
          </div>
          <p className="text-sm text-card-foreground">{result.message}</p>
          {result.status === "blocked" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              Escalation ticket created. Add approved facts and templates before responding publicly.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
