import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReportGeneratorDialog from "./ReportGeneratorDialog";

export default function FloatingReportButton() {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <ReportGeneratorDialog
        trigger={
          <Button size="lg" className="rounded-full h-14 w-14 shadow-lg hover:shadow-xl transition-all">
            <FileText className="h-6 w-6" />
          </Button>
        }
      />
    </div>
  );
}
