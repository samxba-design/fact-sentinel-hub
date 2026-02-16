import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 animate-fade-up">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-4xl font-bold text-foreground">404</h1>
        <p className="text-muted-foreground max-w-sm">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button asChild>
          <a href="/">Return to Dashboard</a>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
