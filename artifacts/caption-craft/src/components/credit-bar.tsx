import { useState } from "react";
import { Zap } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { UpgradeModal } from "./upgrade-modal";

export function CreditBar() {
  const { user, authEnabled } = useAuth();
  const [showModal, setShowModal] = useState(false);

  // Only render when auth is on and user is loaded
  if (!authEnabled || !user) return null;

  const used = user.usageCounter;
  const total = 10;
  const pct = Math.min((used / total) * 100, 100);
  const atLimit = used >= total;

  const barColor =
    used >= 9 ? "bg-red-500" : used >= 5 ? "bg-amber-500" : "bg-emerald-500";
  const textColor =
    used >= 9 ? "text-red-400" : used >= 5 ? "text-amber-400" : "text-emerald-400";

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-card/50 hover:border-primary/40 transition-all min-h-[44px] cursor-pointer"
        title={`${used} / ${total} credits used — click to see details`}
      >
        <Zap className={`w-3.5 h-3.5 flex-shrink-0 ${textColor}`} />
        <div className="space-y-1 min-w-[90px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider leading-none">
              Credits
            </span>
            <span className={`text-[10px] font-bold leading-none ${textColor}`}>
              {used}/{total}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {atLimit && (
          <span className="text-[10px] font-semibold text-red-400 whitespace-nowrap hidden sm:block">
            Upgrade
          </span>
        )}
      </button>

      <UpgradeModal
        open={showModal}
        onClose={() => setShowModal(false)}
        usageResetAt={user.usageResetAt}
      />
    </>
  );
}
