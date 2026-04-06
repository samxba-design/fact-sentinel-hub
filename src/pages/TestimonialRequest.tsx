import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Shield, Star, CheckCircle2, MessageSquare, Loader2 } from "lucide-react";
import ThemeSwitcher from "@/components/ThemeSwitcher";

export default function TestimonialRequest() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [form, setForm] = useState({
    author_name: "",
    author_title: "",
    author_company: "",
    content: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.content.trim() || !form.author_name.trim()) {
      toast({ title: "Please fill in your name and testimonial.", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    try {
      // Look up org by slug
      const { data: org } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("slug", slug || "")
        .maybeSingle();

      if (!org) {
        toast({ title: "Organization not found.", variant: "destructive" });
        setSubmitting(false);
        return;
      }

      // Insert into dedicated testimonials table (not mentions — keeps sentiment data clean)
      const { error } = await supabase.from("testimonials").insert({
        org_id: org.id,
        submitter_name: form.author_name,
        submitter_role: form.author_title || null,
        submitter_company: form.author_company || null,
        content: form.content,
        rating: rating > 0 ? rating : null,
        status: "pending",
        source_slug: slug || null,
      } as any);

      if (error) throw error;

      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="p-1 rounded-lg bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-bold">SentiWatch</span>
          </Link>
          <ThemeSwitcher />
        </div>
      </header>

      <div className="max-w-lg mx-auto px-6 py-16">
        {submitted ? (
          <div className="text-center space-y-5 py-10">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Thank you!</h1>
            <p className="text-muted-foreground">
              Your testimonial has been submitted and will be reviewed before publishing.
            </p>
            <Link to="/">
              <Button variant="outline" className="mt-2">Back to home</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-10 space-y-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold">Leave a testimonial</h1>
              <p className="text-muted-foreground text-sm">
                Share your experience with{" "}
                <span className="font-medium text-foreground">{slug || "this organization"}</span>
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Star rating */}
              <div className="flex flex-col items-center gap-2">
                <Label className="text-sm">Overall rating (optional)</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-1 transition-transform hover:scale-110"
                    >
                      <Star
                        className={`h-7 w-7 transition-colors ${
                          n <= (hoverRating || rating)
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="author_name">Your name *</Label>
                <Input
                  id="author_name"
                  placeholder="Jane Smith"
                  value={form.author_name}
                  onChange={e => setForm(f => ({ ...f, author_name: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="author_title">Job title</Label>
                  <Input
                    id="author_title"
                    placeholder="Head of Comms"
                    value={form.author_title}
                    onChange={e => setForm(f => ({ ...f, author_title: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="author_company">Company</Label>
                  <Input
                    id="author_company"
                    placeholder="Acme Corp"
                    value={form.author_company}
                    onChange={e => setForm(f => ({ ...f, author_company: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="content">Your testimonial *</Label>
                <Textarea
                  id="content"
                  placeholder="What has your experience been like? What problem did SentiWatch solve for you?"
                  rows={5}
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  required
                />
                <p className="text-xs text-muted-foreground">{form.content.length}/500 characters</p>
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>
                ) : (
                  "Submit testimonial"
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Your submission will be reviewed before it's published.{" "}
                <Link to="/privacy" className="underline hover:text-foreground">Privacy policy</Link>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
