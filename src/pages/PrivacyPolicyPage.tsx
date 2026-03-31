import { Shield } from "lucide-react";
import { Link } from "react-router-dom";

export default function PrivacyPolicyPage() {
  const appName = "Fact Sentinel";
  const contactEmail = "privacy@sentiwatch.com";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-bold tracking-tight">{appName}</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16 space-y-8">
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: February 18, 2026</p>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">1. Information We Collect</h2>
          <p className="text-muted-foreground leading-relaxed">
            When you sign up or log in using Google OAuth, we receive and store the following information from your Google account:
          </p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>Your email address</li>
            <li>Your name and profile picture</li>
            <li>Your Google account identifier (user ID)</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            We may also collect usage data such as pages visited, features used, and interaction timestamps to improve our service.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">2. How We Use Your Information</h2>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>To create and manage your account</li>
            <li>To provide, maintain, and improve our services</li>
            <li>To communicate with you about your account or our services</li>
            <li>To ensure security and prevent fraud</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">3. Data Sharing</h2>
          <p className="text-muted-foreground leading-relaxed">
            We do not sell your personal information. We may share data with third-party service providers only as necessary to operate our platform (e.g., hosting, analytics). All third parties are bound by confidentiality obligations.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">4. Data Retention</h2>
          <p className="text-muted-foreground leading-relaxed">
            We retain your personal data for as long as your account is active or as needed to provide services. You may request deletion of your data at any time by contacting us.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">5. Your Rights</h2>
          <p className="text-muted-foreground leading-relaxed">
            You have the right to access, correct, or delete your personal data. You may also revoke {appName}'s access to your Google account at any time via your{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Google Account permissions
            </a>.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">6. Security</h2>
          <p className="text-muted-foreground leading-relaxed">
            We implement industry-standard security measures to protect your data, including encryption in transit and at rest, and role-based access controls.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">7. Contact Us</h2>
          <p className="text-muted-foreground leading-relaxed">
            If you have questions about this Privacy Policy, please contact us at{" "}
            <a href={`mailto:${contactEmail}`} className="text-primary underline">{contactEmail}</a>.
          </p>
        </section>
      </main>

      <footer className="border-t border-border bg-card/40">
        <div className="max-w-4xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span>{appName}</span>
          </div>
          <p>© {new Date().getFullYear()} {appName}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
