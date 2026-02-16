import { Link } from "react-router-dom";
import { Shield, BarChart3, AlertTriangle, Zap, Users, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import ThemeSwitcher from "@/components/ThemeSwitcher";

const features = [
  {
    icon: BarChart3,
    title: "Sentiment Analysis",
    description: "Track brand perception across social media, news, and review platforms in real time.",
  },
  {
    icon: AlertTriangle,
    title: "Risk Detection",
    description: "AI-powered threat identification with severity scoring and automated escalation workflows.",
  },
  {
    icon: Zap,
    title: "Instant Response",
    description: "Generate fact-checked responses using your approved messaging templates and company facts.",
  },
  {
    icon: Users,
    title: "Narrative Tracking",
    description: "Monitor emerging narratives and map key influencers spreading misinformation.",
  },
  {
    icon: FileText,
    title: "Incident Management",
    description: "Coordinate crisis response with timeline tracking, stakeholder alerts, and post-incident reports.",
  },
  {
    icon: Shield,
    title: "Compliance Ready",
    description: "Full audit trail, role-based access, and approved fact libraries for regulated industries.",
  },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-bold tracking-tight">SentiWatch</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitcher />
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="max-w-6xl mx-auto px-6 py-24 sm:py-32 relative">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
              <Shield className="h-3.5 w-3.5" />
              Enterprise Reputation Intelligence
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
              Monitor, detect, and respond to{" "}
              <span className="text-primary">brand threats</span>{" "}
              before they escalate
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              SentiWatch combines AI-powered sentiment analysis with crisis management tools
              to protect your organization's reputation across every channel.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Link to="/auth">
                <Button size="lg" className="text-base px-8">
                  Start free trial
                </Button>
              </Link>
              <Link to="/pricing">
                <Button variant="outline" size="lg" className="text-base px-8">
                  View pricing
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-card/30">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-14 space-y-3">
            <h2 className="text-3xl font-bold tracking-tight">Everything you need to protect your brand</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              From detection to resolution — a complete platform for reputation risk management.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="group p-6 rounded-xl border border-border bg-card hover:border-primary/30 transition-all duration-200 hover:shadow-lg"
              >
                <div className="p-2.5 rounded-lg bg-primary/10 w-fit mb-4 group-hover:bg-primary/15 transition-colors">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-20 text-center space-y-6">
          <h2 className="text-3xl font-bold tracking-tight">Ready to take control of your narrative?</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Join teams that trust SentiWatch to monitor, analyze, and respond to reputation risks in real time.
          </p>
          <Link to="/auth">
            <Button size="lg" className="text-base px-10">Get started today</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/40">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span>SentiWatch</span>
          </div>
          <p>© {new Date().getFullYear()} SentiWatch. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
