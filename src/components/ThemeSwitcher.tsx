import { useTheme, type ThemePalette, type ThemeDensity } from "@/contexts/ThemeContext";
import { Palette, Rows3, Monitor } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const palettes: { id: ThemePalette; label: string; colors: string[] }[] = [
  { id: "midnight", label: "Midnight", colors: ["hsl(222,30%,12%)", "hsl(20,90%,48%)", "hsl(0,0%,98%)"] },
  { id: "arctic", label: "Arctic", colors: ["hsl(210,40%,96%)", "hsl(210,80%,50%)", "hsl(210,10%,20%)"] },
  { id: "ember", label: "Ember", colors: ["hsl(15,20%,10%)", "hsl(15,85%,55%)", "hsl(38,92%,50%)"] },
  { id: "forest", label: "Forest", colors: ["hsl(160,25%,8%)", "hsl(152,60%,45%)", "hsl(45,80%,60%)"] },
];

const densities: { id: ThemeDensity; label: string; icon: React.ReactNode }[] = [
  { id: "compact", label: "Compact", icon: <Rows3 className="h-3.5 w-3.5" /> },
  { id: "default", label: "Default", icon: <Monitor className="h-3.5 w-3.5" /> },
  { id: "comfortable", label: "Comfortable", icon: <Rows3 className="h-3.5 w-3.5 rotate-90" /> },
];

export default function ThemeSwitcher({ className }: { className?: string }) {
  const { palette, density, setPalette, setDensity } = useTheme();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("relative", className)} aria-label="Change theme">
          <Palette className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4" align="end" sideOffset={8}>
        <div className="space-y-4">
          {/* Palette selection */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Color Palette</p>
            <div className="grid grid-cols-2 gap-2">
              {palettes.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPalette(p.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                    palette === p.id
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                      : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className="flex -space-x-1">
                    {p.colors.map((c, i) => (
                      <div
                        key={i}
                        className="h-4 w-4 rounded-full border border-background"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Density selection */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Density</p>
            <div className="flex gap-1">
              {densities.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDensity(d.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-all",
                    density === d.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {d.icon}
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
