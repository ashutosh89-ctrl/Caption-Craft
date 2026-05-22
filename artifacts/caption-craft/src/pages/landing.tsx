import { Sparkles, Zap, Globe, Laugh, Briefcase, Flame } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: <Sparkles className="w-5 h-5" />, label: "5 AI Captions", sub: "per generation" },
  { icon: <Globe className="w-5 h-5" />, label: "3 Platforms", sub: "Insta · LinkedIn · YouTube" },
  { icon: <Laugh className="w-5 h-5" />, label: "Desi/Hinglish", sub: "authentic organic tone" },
  { icon: <Flame className="w-5 h-5" />, label: "Savage Mode", sub: "captions people screenshot" },
  { icon: <Briefcase className="w-5 h-5" />, label: "Professional", sub: "LinkedIn-ready tone" },
  { icon: <Zap className="w-5 h-5" />, label: "10 Free Credits", sub: "every month" },
];

export default function Landing() {
  const loginUrl = `${import.meta.env.BASE_URL}api/auth/google`.replace(/\/\//g, "/");

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-4 py-12 md:py-20">
      <div className="max-w-2xl w-full mx-auto text-center space-y-8 md:space-y-12 animate-in fade-in zoom-in duration-700">

        {/* Brand mark */}
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="w-7 h-7 text-primary" />
          <span className="text-xl font-bold text-primary tracking-tight">CaptionCraft</span>
        </div>

        {/* Hero */}
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight">
            Go Viral.<br />
            <span className="text-primary">Think Desi.</span>
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
            AI-crafted captions for Indian creators. Upload your photo, pick a vibe,
            get 5 platform-perfect captions in seconds — Hinglish, Savage, Funny, Professional.
          </p>
        </div>

        {/* Sign in CTA */}
        <div className="flex flex-col items-center gap-3">
          <a href={loginUrl} className="w-full max-w-xs">
            <Button
              size="lg"
              className="w-full h-14 text-base font-bold gap-3 shadow-[0_0_50px_-10px_hsl(var(--primary))] hover:shadow-[0_0_70px_-10px_hsl(var(--primary))] transition-shadow"
            >
              <FcGoogle className="w-6 h-6 flex-shrink-0" />
              Sign in with Google
            </Button>
          </a>
          <p className="text-xs text-muted-foreground/60">
            Free forever · No credit card needed
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4 pt-2">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-2 p-3 md:p-4 rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm hover:border-primary/30 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary">
                {f.icon}
              </div>
              <div>
                <div className="font-semibold text-sm">{f.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{f.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground/40">
          Powered by Llama 4 Maverick · DeepSeek R1 · Llama 4 Scout
        </p>
      </div>
    </div>
  );
}
