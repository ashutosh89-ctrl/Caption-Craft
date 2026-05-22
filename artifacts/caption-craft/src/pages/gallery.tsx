import {
  useListSavedCaptions,
  useGetCaptionStats,
  useDeleteCaption,
  getListSavedCaptionsQueryKey,
  getGetCaptionStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, CheckCircle, Trash2, Library, BarChart3 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Gallery() {
  const { data: stats } = useGetCaptionStats();
  const { data: captions, isLoading } = useListSavedCaptions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground animate-pulse text-sm">Loading gallery...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in zoom-in duration-500">

      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Library className="text-primary w-6 h-6 sm:w-7 sm:h-7" />
            Saved Captions
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Your personal library of crafted perfection.
          </p>
        </div>

        {/* Stats strip */}
        {stats && (
          <div className="flex items-center gap-0 rounded-xl border border-border bg-card/60 overflow-hidden flex-shrink-0">
            {/* Total */}
            <div className="px-4 py-3 border-r border-border text-center min-w-[72px]">
              <div className="text-xl sm:text-2xl font-bold text-primary leading-none">{stats.totalSaved}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mt-0.5">Total</div>
            </div>
            {/* By platform */}
            <div className="px-3 py-2 flex flex-wrap gap-1.5 items-center max-w-[260px]">
              {stats.byPlatform.map((stat, i) => (
                <Badge key={i} variant="outline" className="bg-background text-xs whitespace-nowrap">
                  {stat.label}: {stat.count}
                </Badge>
              ))}
              {stats.byTone?.map((stat, i) => (
                <Badge key={i} variant="secondary" className="text-xs whitespace-nowrap">
                  {stat.label}: {stat.count}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Stats breakdown (mobile-friendly chart row) ──────────────────── */}
      {stats && stats.totalSaved > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.byPlatform.map((stat) => (
            <Card key={stat.label} className="border-border/50 bg-card/50">
              <CardContent className="p-3 md:p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <BarChart3 className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                    {stat.label}
                  </span>
                </div>
                <div className="text-2xl font-bold text-primary">{stat.count}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Empty state ─────────────────────────────────────────────────── */}
      {(!captions || captions.length === 0) && (
        <Card className="border-dashed bg-card/30">
          <CardContent className="p-10 sm:p-14 flex flex-col items-center text-center gap-4">
            <Library className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground opacity-40" />
            <div>
              <h3 className="text-lg sm:text-xl font-semibold mb-1">Your gallery is empty</h3>
              <p className="text-muted-foreground text-sm sm:text-base max-w-xs mx-auto">
                Generate some captions and save them here for later.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Grid ────────────────────────────────────────────────────────── */}
      {captions && captions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {captions.map((caption) => (
            <SavedCaptionCard key={caption.id} caption={caption} />
          ))}
        </div>
      )}
    </div>
  );
}

function SavedCaptionCard({ caption }: { caption: any }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteCaption = useDeleteCaption();

  const handleCopy = () => {
    const fullText = `${caption.text}\n\n${caption.cta}\n\n${caption.hashtags.join(" ")}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    toast({ description: "Copied to clipboard!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = () => {
    deleteCaption.mutate(
      { id: caption.id },
      {
        onSuccess: () => {
          toast({ title: "Deleted from gallery" });
          queryClient.invalidateQueries({ queryKey: getListSavedCaptionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetCaptionStatsQueryKey() });
        },
      }
    );
  };

  return (
    <Card className="flex flex-col border-border/50 bg-card hover:border-primary/30 transition-colors group overflow-hidden">
      {/* Thumbnail */}
      {caption.imagePreviewBase64 && (
        <div className="h-28 sm:h-32 w-full bg-muted/50 border-b border-border/50 relative overflow-hidden flex-shrink-0">
          <img
            src={`data:image/jpeg;base64,${caption.imagePreviewBase64}`}
            alt="Preview"
            className="w-full h-full object-cover opacity-60 group-hover:opacity-90 transition-opacity"
          />
        </div>
      )}

      <CardContent className="p-4 md:p-5 flex-1 flex flex-col gap-3">
        {/* Platform + tone badges */}
        <div className="flex gap-2 flex-wrap">
          <Badge className="bg-primary/20 text-primary hover:bg-primary/30 border-transparent text-xs">
            {caption.platform}
          </Badge>
          <Badge variant="outline" className="text-xs">{caption.tone}</Badge>
        </div>

        {/* Caption text */}
        <p className="text-sm leading-relaxed line-clamp-4 flex-1">{caption.text}</p>

        {/* Hashtags preview */}
        {caption.hashtags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(caption.hashtags as string[]).slice(0, 4).map((tag, i) => (
              <span key={i} className="text-[11px] text-muted-foreground font-mono">
                {tag.startsWith("#") ? tag : `#${tag}`}
              </span>
            ))}
            {caption.hashtags.length > 4 && (
              <span className="text-[11px] text-muted-foreground/60">+{caption.hashtags.length - 4}</span>
            )}
          </div>
        )}

        {/* Actions — min 44px hit targets */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50 mt-auto gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className={`min-h-[44px] px-3 text-sm ${copied ? "text-green-500" : ""}`}
          >
            {copied ? (
              <CheckCircle className="w-4 h-4 mr-1.5" />
            ) : (
              <Copy className="w-4 h-4 mr-1.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleteCaption.isPending}
            className="min-h-[44px] w-11 px-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Delete caption"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
