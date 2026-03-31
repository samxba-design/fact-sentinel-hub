import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Eye, EyeOff, Ticket, ArrowLeft } from "lucide-react";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { signUp, signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Pre-fill invite code from URL params (e.g. /auth?code=BETA2026)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      setInviteCode(code);
      setIsSignUp(true);
    }
  }, []);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: "Enter your email", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setResetSent(true);
      toast({ title: "Check your email", description: "We sent a password reset link." });
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isSignUp) {
      // Validate invite code if provided
      if (inviteCode.trim()) {
        const { data: redeemResult, error: rpcError } = await supabase.rpc("redeem_beta_code", {
          p_code: inviteCode.trim(),
        });
        if (rpcError) {
          toast({ title: "Error validating invite code", description: rpcError.message, variant: "destructive" });
          setLoading(false);
          return;
        }
        const result = redeemResult as { valid: boolean; reason?: string };
        if (!result.valid) {
          toast({ title: "Invalid invite code", description: result.reason || "Please check and try again.", variant: "destructive" });
          setLoading(false);
          return;
        }
      }

      const { error } = await signUp(email, password, fullName);
      if (error) {
        toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
      } else {
        // Store invite code in localStorage so onboarding can use it
        if (inviteCode.trim()) {
          localStorage.setItem("sentiwatch_beta_code", inviteCode.trim());
        }
        toast({ title: "Check your email", description: "We sent you a verification link." });
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
      } else {
        navigate("/");
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeSwitcher />
      </div>
      <div className="w-full max-w-md space-y-8 animate-fade-up">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 sentinel-glow">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-card-foreground">Fact Sentinel</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Enterprise Sentiment & Risk Monitoring
          </p>
        </div>

        {/* Form */}
        <div className="bg-card border border-border rounded-xl p-8 space-y-6 shadow-xl">
          {forgotPassword ? (
            <>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-card-foreground">Reset password</h2>
                <p className="text-sm text-muted-foreground">
                  {resetSent ? "Check your email for the reset link." : "Enter your email and we'll send a reset link."}
                </p>
              </div>
              {!resetSent ? (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                      className="bg-muted border-border"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Sending..." : "Send reset link"}
                  </Button>
                </form>
              ) : null}
              <div className="text-center">
                <button
                  onClick={() => { setForgotPassword(false); setResetSent(false); }}
                  className="text-sm text-primary hover:underline font-medium inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to sign in
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-card-foreground">
                  {isSignUp ? "Create your account" : "Welcome back"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isSignUp ? "Start monitoring in minutes" : "Sign in to your workspace"}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignUp && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="fullName" className="text-foreground">Full name</Label>
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        placeholder="Jane Smith"
                        required
                        className="bg-muted border-border"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="inviteCode" className="text-foreground flex items-center gap-1.5">
                        <Ticket className="h-3.5 w-3.5 text-primary" />
                        Invite code
                        <span className="text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <Input
                        id="inviteCode"
                        value={inviteCode}
                        onChange={e => setInviteCode(e.target.value)}
                        placeholder="e.g. BETA2026"
                        className="bg-muted border-border"
                      />
                      <p className="text-[11px] text-muted-foreground">Have an invite code? Enter it for free access to all features.</p>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className="bg-muted border-border"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-foreground">Password</Label>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={() => setForgotPassword(true)}
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="bg-muted border-border pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
                </Button>
              </form>

              <div className="text-center text-sm">
                <span className="text-muted-foreground">
                  {isSignUp ? "Already have an account?" : "Don't have an account?"}
                </span>{" "}
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-primary hover:underline font-medium"
                >
                  {isSignUp ? "Sign in" : "Sign up"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Links to features/about for non-logged in users */}
        <div className="text-center text-xs text-muted-foreground space-x-3">
          <Link to="/features" className="text-primary hover:underline">Learn about Fact Sentinel</Link>
          <span>·</span>
          <Link to="/pricing" className="text-primary hover:underline">Pricing</Link>
          <span>·</span>
          <Link to="/contact" className="text-primary hover:underline">Contact us</Link>
        </div>
      </div>
    </div>
  );
}
