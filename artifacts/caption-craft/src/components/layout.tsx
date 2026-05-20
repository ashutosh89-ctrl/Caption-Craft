import { Link, useLocation } from "wouter";
import { Sparkles, Library } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight hover:text-primary transition-colors">
            <Sparkles className="h-6 w-6 text-primary" />
            CaptionCraft
          </Link>
          <nav className="flex items-center gap-6">
            <Link 
              href="/" 
              className={`text-sm font-medium transition-colors hover:text-primary ${location === "/" ? "text-primary" : "text-muted-foreground"}`}
            >
              Generator
            </Link>
            <Link 
              href="/gallery" 
              className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${location === "/gallery" ? "text-primary" : "text-muted-foreground"}`}
            >
              <Library className="h-4 w-4" />
              Gallery
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
