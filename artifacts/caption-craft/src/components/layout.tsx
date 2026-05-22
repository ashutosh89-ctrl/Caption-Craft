import { Link, useLocation } from "wouter";
import { Sparkles, Home, Library } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30">
      {/* ─── Top header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 md:h-16 items-center justify-between px-4 md:px-6 max-w-7xl">
          {/* Brand */}
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-lg md:text-xl tracking-tight hover:text-primary transition-colors"
          >
            <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            <span>CaptionCraft</span>
          </Link>

          {/* Desktop nav — hidden on mobile (replaced by bottom bar) */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/"
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-primary ${
                location === "/" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Home className="h-4 w-4" />
              Generator
            </Link>
            <Link
              href="/gallery"
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-primary ${
                location === "/gallery" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Library className="h-4 w-4" />
              Gallery
            </Link>
          </nav>
        </div>
      </header>

      {/* ─── Page content ─────────────────────────────────────────────────── */}
      {/* pb-20 on mobile leaves space above the bottom nav */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 md:px-6 py-6 md:py-10 pb-24 md:pb-10">
        {children}
      </main>

      {/* ─── Mobile bottom navigation ─────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 flex border-t border-border/60
          bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80
          safe-bottom"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <Link
          href="/"
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] text-xs font-medium transition-colors
            ${location === "/" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Home className="h-5 w-5" />
          Generator
        </Link>
        <div className="w-px bg-border/50 self-stretch my-2" />
        <Link
          href="/gallery"
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] text-xs font-medium transition-colors
            ${location === "/gallery" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Library className="h-5 w-5" />
          Gallery
        </Link>
      </nav>
    </div>
  );
}
