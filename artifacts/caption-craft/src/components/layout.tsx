import { Link, useLocation } from "wouter";
import { Sparkles, Home, Library, LogOut, User } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { CreditBar } from "./credit-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function UserMenu() {
  const { user, authEnabled, logout } = useAuth();
  if (!authEnabled || !user) return null;

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px] min-w-[44px] flex items-center justify-center">
          <Avatar className="h-8 w-8">
            {user.image && <AvatarImage src={user.image} alt={user.name} />}
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <div className="px-3 py-2 text-sm">
          <div className="font-medium truncate">{user.name}</div>
          <div className="text-xs text-muted-foreground truncate">{user.email}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 text-muted-foreground" disabled>
          <User className="w-4 h-4" />
          FREE Plan · {user.usageCounter}/10 credits
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-destructive focus:text-destructive"
          onClick={logout}
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30">
      {/* ─── Top header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 md:h-16 items-center justify-between px-4 md:px-6 max-w-7xl gap-3">
          {/* Brand */}
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-lg md:text-xl tracking-tight hover:text-primary transition-colors flex-shrink-0"
          >
            <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            <span>CaptionCraft</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-5 flex-1 justify-end">
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

          {/* Right side: credit bar + user */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <CreditBar />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* ─── Page content ────────────────────────────────────────────────── */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 md:px-6 py-6 md:py-10 pb-24 md:pb-10">
        {children}
      </main>

      {/* ─── Mobile bottom navigation ────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 flex border-t border-border/60 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <Link
          href="/"
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] text-xs font-medium transition-colors ${
            location === "/" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Home className="h-5 w-5" />
          Generator
        </Link>
        <div className="w-px bg-border/50 self-stretch my-2" />
        <Link
          href="/gallery"
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] text-xs font-medium transition-colors ${
            location === "/gallery" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Library className="h-5 w-5" />
          Gallery
        </Link>
      </nav>
    </div>
  );
}
