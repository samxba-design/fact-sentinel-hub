import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import {
  Shield, Search, Globe, Building2, TrendingUp, Users,
  ArrowRight, Newspaper, BarChart3, Star, Zap, Lock,
} from "lucide-react";

interface OrgProfile {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  plan: string | null;
  created_at: string | null;
}

const INDUSTRIES = [
  "All", "Finance & Crypto", "Technology", "Healthcare",
  "Retail", "Media", "Government", "Energy",
];

const DEMO_ORGS: OrgProfile[] = [
  { id: "1", name: "Binance", slug: "binance", industry: "Finance & Crypto", plan: "enterprise", created_at: null },
  { id: "2", name: "Coinbase", slug: "coinbase", industry: "Finance & Crypto", plan: "pro", created_at: null },
  { id: "3", name: "OpenAI", slug: "openai", industry: "Technology", plan: "enterprise", created_at: null },
  { id: "4", name: "Anthropic", slug: "anthropic", industry: "Technology", plan: "pro", created_at: null },
  { id: "5", name: "Stripe", slug: "stripe", industry: "Finance & Crypto", plan: "pro", created_at: null },
  { id: "6", name: "Cloudflare", slug: "cloudflare", industry: "Technology", plan: "pro", created_at: null },
];

function OrgCard({ org }: { org: OrgProfile }) {
  const initials = org.name.slice(0, 2).toUpperCase();
  const isPro = org.plan === "enterprise" || org.plan === "pro";
  return (
    <Card className="p-5 hover:border-primary/30 transition-all hover:shadow-md group cursor-pointer">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">{initials}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isPro && (
            <Badge variant="outline" className="text-[10px] border-primary/20 text-primary gap-1">
              <Star className="h-2.5 w-2.5" /> Pro
            </Badge>
          )}
          {org.industry && (
            <Badge variant="outline" className="text-[10px]">{org.industry}</Badge>
          )}
        </div>
      </div>
      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{org.name}</h3>
      <p className="text-xs text-muted-foreground mt-1">Active brand monitoring</p>
      <div className="mt-4 flex items-center gap-1.5 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
        <Lock className="h-3 w-3" /> Public shared reports only
      </div>
    </Card>
  );
}

export default function ExplorePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("All");
  const [orgs, setOrgs] = useState<OrgProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load public org profiles (only orgs with public slugs)
    supabase
      .from("organizations")
      .select("id, name, slug, industry, plan, created_at")
      .not("slug", "is", null)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setOrgs(data && data.length > 0 ? data : DEMO_ORGS);
        setLoading(false);
      });
  }, []);

  const filtered = orgs.filter(o => {
    const matchSearch = !search || o.name.toLowerCase().includes(search.toLowerCase());
    const matchIndustry = industry === "All" || o.industry === industry;
    return matchSearch && matchIndustry;
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="p-1 rounded-lg bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-bold tracking-tight hidden sm:block">SentiWatch</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            {user ? (
              <Button size="sm" onClick={() => navigate("/")} className="gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" /> Dashboard
              </Button>
            ) : (
              <div className="flex gap-1.5">
                <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
                <Link to="/auth?mode=signup"><Button size="sm">Start free</Button></Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center space-y-4">
          <Badge variant="outline" className="text-xs border-primary/20 text-primary gap-1.5">
            <Globe className="h-3 w-3" /> Public Explorer
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Organizations monitoring their brand with SentiWatch
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Browse organizations actively using SentiWatch to track narratives, detect threats, and respond to their online reputation.
          </p>
          {!user && (
            <div className="pt-2">
              <Link to="/auth?mode=signup">
                <Button className="gap-2">
                  Start monitoring your brand <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Filters */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-3 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search organizations…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {INDUSTRIES.map(ind => (
              <button
                key={ind}
                onClick={() => setIndustry(ind)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  industry === ind
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-primary/20"
                }`}
              >
                {ind}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-36 rounded-xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No organizations match your search.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">{filtered.length} organizations</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(org => <OrgCard key={org.id} org={org} />)}
            </div>
          </>
        )}
      </div>

      {/* CTA */}
      {!user && (
        <section className="border-t border-border bg-card/30">
          <div className="max-w-3xl mx-auto px-6 py-16 text-center space-y-5">
            <Zap className="h-8 w-8 text-primary mx-auto" />
            <h2 className="text-2xl font-bold">Add your organization to SentiWatch</h2>
            <p className="text-muted-foreground">Start monitoring your brand mentions, detecting narratives, and responding to threats in minutes.</p>
            <Link to="/auth?mode=signup">
              <Button size="lg" className="gap-2 px-8">
                Get started free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      )}

      <footer className="border-t border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span>SentiWatch</span>
          </div>
          <div className="flex gap-4">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <Link to="/how-it-works" className="hover:text-foreground">How It Works</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
