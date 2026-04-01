import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import {
  MessageSquareWarning, Network, Siren, Users, TicketCheck,
  LayoutDashboard, Scan, AlertTriangle, MessageCircleReply,
  BookCheck, FileText, Download, Settings, Search, Target
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";

const PAGES = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/", keywords: "home overview" },
  { label: "Scans", icon: Scan, to: "/scans", keywords: "scan run monitor" },
  { label: "Mentions", icon: MessageSquareWarning, to: "/mentions", keywords: "mention social media post" },
  { label: "Narratives", icon: Network, to: "/narratives", keywords: "narrative story cluster" },
  { label: "People", icon: Users, to: "/people", keywords: "person actor influencer" },
  { label: "Risk Console", icon: AlertTriangle, to: "/risk-console", keywords: "risk threat severity" },
  { label: "Incidents", icon: Siren, to: "/incidents", keywords: "incident crisis event" },
  { label: "How To Respond", icon: MessageCircleReply, to: "/respond", keywords: "response draft reply" },
  { label: "Approved Facts", icon: BookCheck, to: "/approved-facts", keywords: "fact statement verified" },
  { label: "Templates", icon: FileText, to: "/approved-templates", keywords: "template response" },
  { label: "Escalations", icon: TicketCheck, to: "/escalations", keywords: "escalation ticket" },
  { label: "Competitors", icon: Target, to: "/competitors", keywords: "competitor analysis rival" },
  { label: "Exports", icon: Download, to: "/exports", keywords: "export download csv" },
  { label: "Settings", icon: Settings, to: "/settings", keywords: "settings config preference" },
];

interface SearchResult {
  type: "mention" | "narrative" | "incident" | "person" | "escalation";
  id: string;
  label: string;
  detail?: string;
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { currentOrg } = useOrg();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2 || !currentOrg) {
      setResults([]);
      return;
    }
    setLoading(true);
    const orgId = currentOrg.id;
    const term = `%${q}%`;

    const [mentions, narratives, incidents, people, escalations] = await Promise.all([
      supabase.from("mentions").select("id, content, source").eq("org_id", orgId).eq("mention_type", "brand").ilike("content", term).limit(5),
      supabase.from("narratives").select("id, name").eq("org_id", orgId).ilike("name", term).limit(5),
      supabase.from("incidents").select("id, name").eq("org_id", orgId).ilike("name", term).limit(5),
      supabase.from("people").select("id, name").ilike("name", term).limit(5),
      supabase.from("escalations").select("id, title").eq("org_id", orgId).ilike("title", term).limit(5),
    ]);

    const r: SearchResult[] = [
      ...(mentions.data?.map(m => ({ type: "mention" as const, id: m.id, label: (m.content || "").slice(0, 80), detail: m.source })) || []),
      ...(narratives.data?.map(n => ({ type: "narrative" as const, id: n.id, label: n.name })) || []),
      ...(incidents.data?.map(i => ({ type: "incident" as const, id: i.id, label: i.name })) || []),
      ...(people.data?.map(p => ({ type: "person" as const, id: p.id, label: p.name })) || []),
      ...(escalations.data?.map(e => ({ type: "escalation" as const, id: e.id, label: e.title })) || []),
    ];
    setResults(r);
    setLoading(false);
  }, [currentOrg]);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  const go = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  const typeRoutes: Record<string, string> = {
    mention: "/mentions",
    narrative: "/narratives",
    incident: "/incidents",
    person: "/people",
    escalation: "/escalations",
  };

  const typeIcons: Record<string, React.ElementType> = {
    mention: MessageSquareWarning,
    narrative: Network,
    incident: Siren,
    person: Users,
    escalation: TicketCheck,
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:bg-accent/50 transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search mentions, narratives, incidents, people..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>{loading ? "Searching..." : "No results found."}</CommandEmpty>

          {/* Quick nav pages */}
          {!query && (
            <CommandGroup heading="Pages">
              {PAGES.map(p => (
                <CommandItem key={p.to} onSelect={() => go(p.to)}>
                  <p.icon className="mr-2 h-4 w-4" />
                  {p.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Pages matching query */}
          {query && (
            <CommandGroup heading="Pages">
              {PAGES.filter(p =>
                p.label.toLowerCase().includes(query.toLowerCase()) ||
                p.keywords.includes(query.toLowerCase())
              ).map(p => (
                <CommandItem key={p.to} onSelect={() => go(p.to)}>
                  <p.icon className="mr-2 h-4 w-4" />
                  {p.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* DB results */}
          {results.length > 0 && (
            <CommandGroup heading="Results">
              {results.map(r => {
                const Icon = typeIcons[r.type];
                return (
                  <CommandItem
                    key={`${r.type}-${r.id}`}
                    onSelect={() => go(`${typeRoutes[r.type]}/${r.id}`)}
                  >
                    <Icon className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate">{r.label}</span>
                    <CommandShortcut>{r.type}</CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
