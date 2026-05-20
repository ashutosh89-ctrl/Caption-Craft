import { useListSavedCaptions, useGetCaptionStats, useDeleteCaption, getListSavedCaptionsQueryKey, getGetCaptionStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, CheckCircle, Trash2, Library } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Gallery() {
  const { data: stats } = useGetCaptionStats();
  const { data: captions, isLoading } = useListSavedCaptions();
  
  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading gallery...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Library className="text-primary" /> Saved Captions
          </h1>
          <p className="text-muted-foreground mt-1">Your personal library of crafted perfection.</p>
        </div>
        
        {stats && (
          <div className="flex items-center gap-4 bg-secondary/50 p-3 rounded-lg border border-border">
            <div className="text-center px-4 border-r border-border">
              <div className="text-2xl font-bold text-primary">{stats.totalSaved}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Total</div>
            </div>
            <div className="flex gap-2 text-sm">
              {stats.byPlatform.map((stat, i) => (
                <Badge key={i} variant="outline" className="bg-background">
                  {stat.label}: {stat.count}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {!captions || captions.length === 0 ? (
        <Card className="border-dashed bg-card/30 p-12 text-center">
          <Library className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-medium mb-2">Your gallery is empty</h3>
          <p className="text-muted-foreground">Generate some captions and save them here for later.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
    deleteCaption.mutate({ id: caption.id }, {
      onSuccess: () => {
        toast({ title: "Deleted from gallery" });
        queryClient.invalidateQueries({ queryKey: getListSavedCaptionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCaptionStatsQueryKey() });
      }
    });
  };

  return (
    <Card className="flex flex-col border-border/50 bg-card hover:border-primary/30 transition-colors group">
      {caption.imagePreviewBase64 && (
        <div className="h-32 w-full bg-muted/50 border-b border-border/50 relative overflow-hidden">
          <img 
            src={`data:image/jpeg;base64,${caption.imagePreviewBase64}`} 
            alt="Preview" 
            className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
          />
        </div>
      )}
      <CardContent className="p-5 flex-1 flex flex-col">
        <div className="flex gap-2 mb-4">
          <Badge className="bg-primary/20 text-primary hover:bg-primary/30 border-transparent">{caption.platform}</Badge>
          <Badge variant="outline">{caption.tone}</Badge>
        </div>
        
        <p className="text-sm line-clamp-4 flex-1 mb-4">
          {caption.text}
        </p>
        
        <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/50">
          <Button variant="ghost" size="sm" onClick={handleCopy} className={copied ? "text-green-500" : ""}>
            {copied ? <CheckCircle className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleteCaption.isPending} className="text-destructive hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
