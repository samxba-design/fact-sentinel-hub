import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Info } from "lucide-react";

function TabInfoBanner({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4 rounded-lg bg-primary/5 border border-primary/15">
      <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div className="space-y-1 text-xs text-primary/80">
        <p className="font-semibold text-sm text-primary">{title}</p>
        {children}
      </div>
    </div>
  );
}

export default function AlertSettingsTab() {
  const navigate = useNavigate();

  return (
    <Card className="bg-card border-border p-6 space-y-5">
      <TabInfoBanner icon={Bell} title="About alert configuration">
        <p>Alert rules, scan schedules, quiet hours, and alert email routing are managed from the <strong>Alerts & Monitoring</strong> page — this keeps all your monitoring settings in one place for a unified experience.</p>
      </TabInfoBanner>
      <Button onClick={() => navigate("/alerts")} className="gap-2">
        <Bell className="h-4 w-4" /> Go to Alerts & Monitoring
      </Button>
    </Card>
  );
}
