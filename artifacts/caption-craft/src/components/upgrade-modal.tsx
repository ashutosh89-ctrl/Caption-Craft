import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Flame, Zap, Calendar, Sparkles } from "lucide-react";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  usageResetAt: string;
}

export function UpgradeModal({ open, onClose, usageResetAt }: UpgradeModalProps) {
  const resetDate = new Date(usageResetAt);
  resetDate.setDate(resetDate.getDate() + 30);

  const handleWaitlist = () => {
    window.open(
      "mailto:hello@captioncraft.app?subject=Premium%20Creator%20Waitlist&body=Hi%2C%20I%27d%20like%20to%20join%20the%20premium%20waitlist%20for%20CaptionCraft!",
      "_blank"
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm sm:max-w-md mx-4">
        <DialogHeader>
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500/15 border border-red-500/20 mx-auto mb-4">
            <Zap className="w-8 h-8 text-red-500" />
          </div>
          <DialogTitle className="text-center text-xl font-bold">
            Monthly limit reached!
          </DialogTitle>
          <DialogDescription className="text-center text-sm leading-relaxed mt-1">
            As a FREE creator, you get{" "}
            <span className="font-semibold text-foreground">10 caption generations</span> per
            month. You've used them all!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Reset date */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-secondary/50 border border-border">
            <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm text-muted-foreground">
              Credits reset on{" "}
              <span className="text-foreground font-medium">
                {resetDate.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </span>
          </div>

          {/* Premium perks */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 space-y-1.5">
            <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
              Premium Perks
            </div>
            {[
              "Unlimited caption generations",
              "Priority AI model access",
              "Advanced analytics dashboard",
              "Early access to new features",
            ].map((perk) => (
              <div key={perk} className="flex items-center gap-2 text-sm text-foreground/80">
                <Sparkles className="w-3 h-3 text-primary flex-shrink-0" />
                {perk}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <Button
            size="lg"
            className="w-full h-12 font-bold shadow-[0_0_30px_-10px_hsl(var(--primary))]"
            onClick={handleWaitlist}
          >
            <Flame className="w-4 h-4 mr-2" />
            Join Premium Creator Waitlist
          </Button>
          <Button variant="ghost" size="lg" className="w-full h-11 text-muted-foreground" onClick={onClose}>
            Wait for reset
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
