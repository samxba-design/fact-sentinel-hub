import React from "react";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface InfoTooltipProps {
  text: string;
  className?: string;
}

const InfoTooltip = React.forwardRef<HTMLDivElement, InfoTooltipProps>(
  function InfoTooltip({ text, className }, ref) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span ref={ref} className="inline-flex">
            <HelpCircle className={`h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help transition-colors ${className || ""}`} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    );
  }
);

export default InfoTooltip;
