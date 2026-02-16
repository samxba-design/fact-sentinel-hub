import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Crown, Mail, Phone, Building2, Users, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useNavigate } from "react-router-dom";

interface ContactPopoverProps {
  department?: string | null;
  children: React.ReactNode;
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  role_title: string | null;
  phone: string | null;
  is_department_lead: boolean | null;
}

export default function ContactPopover({ department, children }: ContactPopoverProps) {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !currentOrg || !department) return;
    setLoading(true);
    supabase
      .from("internal_contacts")
      .select("id, name, email, department, role_title, phone, is_department_lead")
      .eq("org_id", currentOrg.id)
      .eq("department", department)
      .order("is_department_lead", { ascending: false })
      .order("name")
      .then(({ data }) => {
        setContacts(data || []);
        setLoading(false);
      });
  }, [open, currentOrg, department]);

  if (!department) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer transition-colors">
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">{department}</span>
          </div>
        </div>
        <div className="p-2 max-h-60 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-muted-foreground animate-pulse p-2">Loading...</p>
          ) : contacts.length === 0 ? (
            <div className="p-2 text-center">
              <p className="text-xs text-muted-foreground mb-2">No contacts in this department</p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setOpen(false); navigate("/contacts"); }}>
                <Users className="h-3 w-3 mr-1" /> Add Contact
              </Button>
            </div>
          ) : (
            contacts.map(c => (
              <div key={c.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0 mt-0.5">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground truncate">{c.name}</span>
                    {c.is_department_lead && <Crown className="h-3 w-3 text-sentinel-amber shrink-0" />}
                  </div>
                  {c.role_title && <p className="text-[10px] text-muted-foreground">{c.role_title}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                        <Mail className="h-2.5 w-2.5" /> Email
                      </a>
                    )}
                    {c.phone && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Phone className="h-2.5 w-2.5" /> {c.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-2 border-t border-border">
          <Button size="sm" variant="ghost" className="w-full h-7 text-xs text-primary" onClick={() => { setOpen(false); navigate("/contacts"); }}>
            <ExternalLink className="h-3 w-3 mr-1" /> View All Contacts
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
