import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink, MessageCircle, MessagesSquare, Copy, Check, AlertCircle, Zap } from "lucide-react";

export default function SocialScannerSetup() {
  const [copied, setCopied] = React.useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Card className="bg-card border-border p-6">
      <Tabs defaultValue="telegram">
        <TabsList className="mb-4">
          <TabsTrigger value="telegram" className="gap-2">
            <MessageCircle className="h-3.5 w-3.5" /> Telegram
          </TabsTrigger>
          <TabsTrigger value="discord" className="gap-2">
            <MessagesSquare className="h-3.5 w-3.5" /> Discord
          </TabsTrigger>
        </TabsList>

        {/* ── Telegram Setup ─────────────────────────────────────── */}
        <TabsContent value="telegram" className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-1">Telegram Monitoring</h3>
            <p className="text-xs text-muted-foreground">
              SentiWatch monitors public Telegram channels for brand mentions. Two modes available:
            </p>
          </div>

          {/* Mode 1: Public */}
          <Card className="bg-muted/30 border-border p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-medium">Mode 1: Public Channel Monitoring (Zero Setup)</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Works immediately for any public Telegram channel. No bot, no API key. Just add channel names.
                </p>
              </div>
            </div>
            <div className="bg-background rounded-md p-3 text-xs font-mono text-muted-foreground">
              <p className="text-primary font-medium mb-1">How it works:</p>
              <p>1. Go to Settings → Sources → Add Source → Telegram</p>
              <p>2. Enter channel usernames (e.g., coindesk, cointelegraph, WuBlockchain)</p>
              <p>3. SentiWatch reads public previews via t.me/s/channel</p>
            </div>
          </Card>

          {/* Mode 2: Bot */}
          <Card className="bg-muted/30 border-border p-4 space-y-3">
            <div className="flex items-start gap-3">
              <MessagesSquare className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-medium">Mode 2: Bot-Enhanced (More Messages, Private Groups)</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Create a Telegram bot for deeper access — more message history, private group support.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Step 1: Create a bot with @BotFather</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 gap-1"
                    onClick={() => copyToClipboard("/newbot", "newbot")}
                  >
                    {copied === "newbot" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copy /newbot
                  </Button>
                  <span className="text-xs text-muted-foreground">→ Send this to @BotFather on Telegram</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7"
                    onClick={() => window.open("https://t.me/botfather", "_blank")}
                  >
                    Open BotFather <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Step 2: Get your bot token</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  BotFather will give you a token like <code className="bg-muted px-1 rounded text-[11px]">123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11</code>
                </p>
              </div>
              <div>
                <Label className="text-xs">Step 3: Add bot to channels</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Add your bot as an <strong>administrator</strong> to the channels you want to monitor (Read Messages permission is enough).
                </p>
              </div>
              <div>
                <Label className="text-xs">Step 4: Save token in SentiWatch</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    placeholder="Paste bot token here"
                    className="h-8 text-xs font-mono"
                  />
                  <Button size="sm" className="h-7 text-xs">Save</Button>
                </div>
              </div>
            </div>
          </Card>

          <div className="flex items-start gap-2 p-3 rounded-md bg-blue-500/10 border border-blue-500/20">
            <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-300">
              <strong>Pro tip:</strong> Start with Mode 1 (public channels). Add bot mode later for private groups or deeper
              history. Most crypto discussion happens in public channels — Mode 1 already covers 80% of relevant content.
            </p>
          </div>
        </TabsContent>

        {/* ── Discord Setup ─────────────────────────────────────── */}
        <TabsContent value="discord" className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-1">Discord Monitoring</h3>
            <p className="text-xs text-muted-foreground">
              Monitor Discord servers for brand and competitor mentions. Requires a Discord bot.
            </p>
          </div>

          <Card className="bg-muted/30 border-border p-4 space-y-4">
            <div className="flex items-start gap-3">
              <MessagesSquare className="h-5 w-5 text-indigo-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-medium">Discord Bot Setup Guide</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Complete these steps once, then SentiWatch can scan any server your bot is in.
                </p>
              </div>
            </div>

            {/* Step 1 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Step 1: Create a Discord Application</Label>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7"
                  onClick={() => window.open("https://discord.com/developers/applications", "_blank")}
                >
                  Open Developer Portal <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </div>
              <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
                <li>Click <strong>New Application</strong> → give it a name (e.g., "SentiWatch Scanner")</li>
                <li>Go to <strong>Bot</strong> → click <strong>Add Bot</strong></li>
                <li>Under <strong>Privileged Gateway Intents</strong>, enable:
                  <ul className="list-disc list-inside ml-4 mt-0.5 text-[11px]">
                    <li>✅ Message Content Intent</li>
                    <li>✅ Server Members Intent (optional)</li>
                  </ul>
                </li>
              </ol>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Step 2: Copy your Bot Token</Label>
              <p className="text-xs text-muted-foreground">
                In the <strong>Bot</strong> tab, click <strong>Reset Token</strong> → Copy the token.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Paste Discord bot token here"
                  className="h-8 text-xs font-mono"
                />
                <Button size="sm" className="h-7 text-xs">Save</Button>
              </div>
            </div>

            {/* Step 3 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Step 3: Invite the bot to servers</Label>
              <p className="text-xs text-muted-foreground">
                Go to <strong>OAuth2 → URL Generator</strong> in your Discord app:
              </p>
              <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
                <li>Scopes: check <strong>bot</strong></li>
                <li>Bot Permissions: check <strong>Read Messages</strong> and <strong>Read Message History</strong></li>
                <li>Copy the generated URL and open it in your browser</li>
                <li>Select the server you want to monitor → Authorize</li>
              </ol>
            </div>

            {/* Step 4 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Step 4: Find your Server (Guild) IDs</Label>
              <p className="text-xs text-muted-foreground">
                Enable Developer Mode in Discord: <strong>User Settings → Advanced → Developer Mode</strong>.
                Then right-click any server icon → <strong>Copy Server ID</strong>.
              </p>
              <div className="bg-background rounded-md p-3 text-xs font-mono text-muted-foreground">
                <p className="text-primary font-medium mb-1">After setup:</p>
                <p>1. Go to Settings → Sources → Add Source → Discord</p>
                <p>2. Enter the Server ID you copied</p>
                <p>3. Save. Next scan will include that server.</p>
              </div>
            </div>
          </Card>

          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-300">
              <strong>Important notes:</strong>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>The bot can only read channels it has access to. Give it the same role permissions as a regular member.</li>
                <li>Rate limit: Discord allows ~50 messages/second. SentiWatch scans channels sequentially to stay within limits.</li>
                <li>Privacy: The bot only reads message text — no voice, DMs, or file contents. All data stays in your SentiWatch org.</li>
                <li>First scan may take longer as it processes message history. Subsequent scans only check new messages.</li>
              </ul>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}