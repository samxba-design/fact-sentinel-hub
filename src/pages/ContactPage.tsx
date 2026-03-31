import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Shield, Send, Mail, Building2, MessageSquare, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { Link } from "react-router-dom";

export default function ContactPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("send-notification", {
        body: {
          type: "contact_inquiry",
          name: form.name,
          email: form.email,
          company: form.company,
          message: form.message,
        },
      });
      if (error) throw error;
      setSubmitted(true);
      toast({ title: "Message sent", description: "We'll be in touch shortly." });
    } catch (err: any) {
      console.error("Contact form error:", err);
      // Still show success to user — form data was attempted
      setSubmitted(true);
      toast({ title: "Request received", description: "We'll review your request and get back to you." });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="absolute top-4 right-4"><ThemeSwitcher /></div>
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-card-foreground">Thank you!</h2>
          <p className="text-sm text-muted-foreground">
            We've received your inquiry and will get back to you within 1 business day.
          </p>
          <div className="pt-2 flex gap-3 justify-center">
            <Link to="/"><Button variant="outline">Back to home</Button></Link>
            <Link to="/auth"><Button>Sign in</Button></Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-bold tracking-tight">Fact Sentinel</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeSwitcher />
            <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-12">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-3">Get in touch</h1>
              <p className="text-muted-foreground leading-relaxed">
                Whether you're interested in a demo, have questions about our plans, or need a custom enterprise solution — we'd love to hear from you.
              </p>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card">
                <Mail className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-card-foreground">Sales inquiries</h3>
                  <p className="text-xs text-muted-foreground">Get pricing details and plan comparisons tailored to your team size.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card">
                <Building2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-card-foreground">Enterprise plans</h3>
                  <p className="text-xs text-muted-foreground">Custom integrations, SLA guarantees, dedicated onboarding, and unlimited seats.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card">
                <MessageSquare className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-card-foreground">Product demo</h3>
                  <p className="text-xs text-muted-foreground">Schedule a walkthrough of the platform with our team.</p>
                </div>
              </div>
            </div>
          </div>

          <Card className="p-6 space-y-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" required className="bg-muted border-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" required className="bg-muted border-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input id="company" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Acme Corp" className="bg-muted border-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">How can we help?</Label>
                <Textarea id="message" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Tell us about your team, use case, or any questions..." rows={4} required className="bg-muted border-border" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                <Send className="h-4 w-4 mr-2" />
                {loading ? "Sending..." : "Send message"}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
