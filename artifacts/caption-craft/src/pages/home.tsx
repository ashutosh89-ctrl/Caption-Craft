import { useState, useCallback } from "react";
import { useRefineCaption, useSaveCaption, getListSavedCaptionsQueryKey, getGetCaptionStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UploadCloud, Sparkles, Copy, CheckCircle, RefreshCcw, Save, Loader2, BrainCircuit, ScanEye, Zap } from "lucide-react";

const PLATFORMS = ["Instagram", "LinkedIn", "YouTube"];
const TONES = ["Desi/Hinglish", "Funny", "Professional", "Savage"];

interface GeneratedCaption { text: string; hashtags: string[]; cta: string; }
interface VisualAnalysis { sceneDescription: string; mood: string; keyObjects: string[]; colorPalette: string[]; humanCount: number; }
interface GenerateResult { captions: GeneratedCaption[]; visualAnalysis: VisualAnalysis; }

type PipelineStage = "idle" | "scanning" | "thinking" | "generating" | "done" | "error";

const STAGE_CONFIG: Record<PipelineStage, { icon: React.ReactNode; label: string; sub?: string }> = {
  idle: { icon: null, label: "" },
  scanning: {
    icon: <ScanEye className="w-8 h-8 text-primary animate-pulse" />,
    label: "Maverick is scanning your visuals...",
    sub: "Extracting scene, mood, and elements from your image",
  },
  thinking: {
    icon: <BrainCircuit className="w-8 h-8 text-primary animate-bounce" />,
    label: "AI is reasoning through your image profile...",
    sub: "Thinking context: building platform-perfect captions",
  },
  generating: {
    icon: <Zap className="w-8 h-8 text-primary animate-pulse" />,
    label: "Crafting your viral captions...",
    sub: "Applying Desi hooks, hashtags, and CTAs",
  },
  done: { icon: null, label: "" },
  error: { icon: null, label: "" },
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [platform, setPlatform] = useState("Instagram");
  const [tone, setTone] = useState("Desi/Hinglish");
  const [isDragging, setIsDragging] = useState(false);

  const [stage, setStage] = useState<PipelineStage>("idle");
  const [stageMessage, setStageMessage] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const { toast } = useToast();

  const processFile = (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please upload an image file", variant: "destructive" });
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setResult(null);
    setErrorMsg("");
    setStage("idle");
    const reader = new FileReader();
    reader.onload = (e) => {
      const res = e.target?.result as string;
      setBase64Image(res.split(",")[1] ?? "");
    };
    reader.readAsDataURL(f);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };

  const handleGenerate = useCallback(async () => {
    if (!base64Image || !file) return;
    setResult(null);
    setErrorMsg("");
    setStage("scanning");
    setStageMessage("Maverick is scanning your visuals...");

    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/captions/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64Image, imageType: file.type, platform, tone }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw) as
              | { type: "stage"; message: string }
              | { type: "thinking" }
              | { type: "done"; captions: GeneratedCaption[]; visualAnalysis: VisualAnalysis }
              | { type: "error"; message: string };

            if (event.type === "stage") {
              setStageMessage(event.message);
              if (event.message.toLowerCase().includes("reasoning") || event.message.toLowerCase().includes("deepseek")) {
                setStage("thinking");
              } else {
                setStage("scanning");
              }
            } else if (event.type === "thinking") {
              setStage("thinking");
            } else if (event.type === "done") {
              setResult({ captions: event.captions, visualAnalysis: event.visualAnalysis });
              setStage("done");
            } else if (event.type === "error") {
              setErrorMsg(event.message);
              setStage("error");
              toast({ title: "Generation failed", description: event.message, variant: "destructive" });
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setErrorMsg(msg);
      setStage("error");
      toast({ title: "Failed to generate", description: msg, variant: "destructive" });
    }
  }, [base64Image, file, platform, tone, toast]);

  const isPending = stage === "scanning" || stage === "thinking" || stage === "generating";
  const activeStageConfig = STAGE_CONFIG[stage];

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
      <div className="text-center space-y-4">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
          CaptionCraft <span className="text-primary">AI</span>
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto text-lg">
          Upload an image, pick your vibe, and let AI write platform-perfect captions that actually sound like you.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Upload card */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-xl">
          <CardHeader><CardTitle>1. Upload Visual</CardTitle></CardHeader>
          <CardContent>
            <div
              data-testid="drop-zone"
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[300px]
                ${isDragging ? "border-primary bg-primary/10 scale-105" : "border-muted hover:border-primary/50"}
                ${previewUrl ? "p-2" : ""}
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById("image-upload")?.click()}
            >
              <input id="image-upload" type="file" accept="image/*" className="hidden" onChange={handleFileSelect} data-testid="input-image" />
              {previewUrl ? (
                <div className="relative w-full h-full rounded-lg overflow-hidden group">
                  <img src={previewUrl} alt="Preview" className="w-full h-[280px] object-cover rounded-lg" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <p className="text-white font-medium flex items-center gap-2">
                      <RefreshCcw className="w-4 h-4" /> Replace Image
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">Drag &amp; Drop</p>
                    <p className="text-sm text-muted-foreground">or click to browse</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Settings card */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-xl flex flex-col">
          <CardHeader><CardTitle>2. Settings</CardTitle></CardHeader>
          <CardContent className="space-y-6 flex-1 flex flex-col">
            <div className="space-y-3">
              <label className="text-sm font-medium">Platform</label>
              <Select value={platform} onValueChange={setPlatform} disabled={isPending}>
                <SelectTrigger className="w-full h-12 bg-background" data-testid="select-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Tone &amp; Vibe</label>
              <Select value={tone} onValueChange={setTone} disabled={isPending}>
                <SelectTrigger className="w-full h-12 bg-background" data-testid="select-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-auto pt-6">
              <Button
                data-testid="button-generate"
                onClick={handleGenerate}
                disabled={!base64Image || isPending}
                className="w-full h-14 text-lg font-bold shadow-[0_0_40px_-10px_hsl(var(--primary))] transition-shadow hover:shadow-[0_0_60px_-10px_hsl(var(--primary))]"
                size="lg"
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    Generate Captions
                  </span>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline loading state */}
      {isPending && (
        <div className="py-14 text-center space-y-6 animate-in slide-in-from-bottom-8">
          <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 border-4 border-primary/20 rounded-full animate-ping" />
            <div className="absolute inset-2 border-4 border-primary/50 rounded-full animate-pulse" />
            <div className="relative">{activeStageConfig.icon}</div>
          </div>

          <div className="space-y-2">
            <p className="text-xl font-semibold text-primary animate-pulse">{stageMessage || activeStageConfig.label}</p>
            {stage === "thinking" && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary/80 mt-2">
                <BrainCircuit className="w-4 h-4 animate-pulse" />
                <span>Thinking Context: AI is reasoning through your image profile...</span>
              </div>
            )}
            {activeStageConfig.sub && stage !== "thinking" && (
              <p className="text-sm text-muted-foreground">{activeStageConfig.sub}</p>
            )}
          </div>

          {/* Stage progress dots */}
          <div className="flex items-center justify-center gap-3">
            {["scanning", "thinking", "generating"].map((s, i) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  stage === s
                    ? "bg-primary scale-125 shadow-[0_0_8px_2px_hsl(var(--primary)/0.5)]"
                    : i < ["scanning", "thinking", "generating"].indexOf(stage)
                    ? "bg-primary/60"
                    : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {stage === "error" && errorMsg && (
        <div className="py-8 text-center animate-in slide-in-from-bottom-4">
          <div className="inline-flex flex-col items-center gap-3 px-6 py-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive max-w-md mx-auto">
            <p className="font-medium">Generation failed</p>
            <p className="text-sm text-destructive/80">{errorMsg}</p>
            <Button variant="outline" size="sm" onClick={handleGenerate} className="border-destructive/40 text-destructive hover:bg-destructive/10">
              <RefreshCcw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && stage === "done" && (
        <div className="space-y-6 animate-in slide-in-from-bottom-12 duration-700">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="text-primary" /> Generated Captions
            </h2>
            <Badge variant="outline" className="text-muted-foreground">
              {platform} · {tone}
            </Badge>
          </div>
          <div className="grid gap-6">
            {result.captions.map((caption, i) => (
              <CaptionCard
                key={i}
                caption={caption}
                index={i}
                platform={platform}
                tone={tone}
                base64Image={base64Image}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface CaptionCardProps {
  caption: GeneratedCaption;
  index: number;
  platform: string;
  tone: string;
  base64Image: string | null;
}

function CaptionCard({ caption, index, platform, tone, base64Image }: CaptionCardProps) {
  const [copied, setCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [currentCaption, setCurrentCaption] = useState(caption);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const refineCaption = useRefineCaption();
  const saveCaption = useSaveCaption();

  const handleCopy = () => {
    const fullText = `${currentCaption.text}\n\n${currentCaption.cta}\n\n${currentCaption.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    toast({ description: "Copied to clipboard!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefine = () => {
    refineCaption.mutate(
      { data: { captionText: currentCaption.text, platform, tone, hashtags: currentCaption.hashtags, cta: currentCaption.cta } },
      {
        onSuccess: (data) => {
          setCurrentCaption(data);
          toast({ title: "Refined!", description: "Caption has been polished by Scout." });
        },
        onError: () => toast({ title: "Refinement failed", variant: "destructive" }),
      }
    );
  };

  const handleSave = () => {
    if (isSaved) return;
    saveCaption.mutate(
      { data: { text: currentCaption.text, hashtags: currentCaption.hashtags, cta: currentCaption.cta, platform, tone, imagePreviewBase64: base64Image } },
      {
        onSuccess: () => {
          setIsSaved(true);
          toast({ title: "Saved to Gallery!" });
          queryClient.invalidateQueries({ queryKey: getListSavedCaptionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetCaptionStatsQueryKey() });
        },
        onError: () => toast({ title: "Save failed", variant: "destructive" }),
      }
    );
  };

  return (
    <Card
      data-testid={`card-caption-${index}`}
      className="border-border/50 bg-card hover:border-primary/30 transition-all duration-200"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
            {index + 1}
          </div>
          <div className="flex-1 space-y-3">
            <p className="whitespace-pre-wrap text-base leading-relaxed">{currentCaption.text}</p>

            {currentCaption.cta && (
              <p className="font-semibold text-primary text-sm">{currentCaption.cta}</p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {currentCaption.hashtags.map((tag, i) => (
                <Badge key={i} variant="secondary" className="font-mono text-xs text-muted-foreground hover:text-foreground cursor-default">
                  {tag.startsWith("#") ? tag : `#${tag}`}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <div className="flex gap-2">
            <Button
              data-testid={`button-copy-${index}`}
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className={copied ? "text-green-500 border-green-500/50 bg-green-500/10" : ""}
            >
              {copied ? <CheckCircle className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
            <Button
              data-testid={`button-refine-${index}`}
              variant="ghost"
              size="sm"
              onClick={handleRefine}
              disabled={refineCaption.isPending}
            >
              {refineCaption.isPending
                ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                : <RefreshCcw className="w-4 h-4 mr-1.5" />}
              Refine via Scout
            </Button>
          </div>
          <Button
            data-testid={`button-save-${index}`}
            variant={isSaved ? "secondary" : "default"}
            size="sm"
            onClick={handleSave}
            disabled={isSaved || saveCaption.isPending}
          >
            {saveCaption.isPending
              ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              : <Save className="w-4 h-4 mr-1.5" />}
            {isSaved ? "Saved" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
