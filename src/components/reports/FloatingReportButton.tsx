import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ReportGeneratorDialog from "./ReportGeneratorDialog";

export default function FloatingReportButton() {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <ReportGeneratorDialog
                trigger={
                  <Button size="lg" className="rounded-full h-14 w-14 shadow-lg hover:shadow-xl transition-all">
                    <FileText className="h-6 w-6" />
                  </Button>
                }
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="left" className="bg-popover border-border text-popover-foreground z-50">
            <p className="text-xs font-medium">Generate PDF Report</p>
            <p className="text-xs text-muted-foreground">Create a downloadable report with AI insights</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
