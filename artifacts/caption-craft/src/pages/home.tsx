import { useState, useCallback } from "react";
import {
  useRefineCaption,
  useSaveCaption,
  getListSavedCaptionsQueryKey,
  getGetCaptionStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  UploadCloud,
  Sparkles,
  Copy,
  CheckCircle,
  RefreshCcw,
  Save,
  Loader2,
  BrainCircuit,
  ScanEye,
  Zap,
  ImageIcon,
} from "lucide-react";

const PLATFORMS = ["Instagram", "LinkedIn", "YouTube"];
const TONES = ["Desi/Hinglish", "Funny", "Professional", "Savage"];

interface GeneratedCaption {
  text: string;
  hashtags: string[];
  cta: string;
}
interface VisualAnalysis {
  sceneDescription: string;
  mood: string;
  keyObjects: string[];
  colorPalette: string[];
  humanCount: number;
}
interface GenerateResult {
  captions: GeneratedCaption[];
  visualAnalysis: VisualAnalysis;
}

type PipelineStage = "idle" | "scanning" | "thinking" | "generating" | "done" | "error";

const STAGE_META: Record<
  PipelineStage,
  { icon?: React.ReactNode; label: string; sub?: string }
> = {
  idle: { label: "" },
  scanning: {
    icon: <ScanEye className="w-7 h-7 text-primary animate-pulse" />,
    label: "Maverick is scanning your visuals...",
    sub: "Extracting scene, mood and elements from your image",
  },
  thinking: {
    icon: <BrainCircuit className="w-7 h-7 text-primary animate-bounce" />,
    label: "AI is reasoning through your image profile...",
    sub: "Building platform-perfect captions",
  },
  generating: {
    icon: <Zap className="w-7 h-7 text-primary animate-pulse" />,
    label: "Crafting your viral captions...",
    sub: "Applying Desi hooks, hashtags and CTAs",
  },
  done: { label: "" },
  error: { label: "" },
};

const STAGE_STEPS: PipelineStage[] = ["scanning", "thinking", "generating"];

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
    e.preventDefault();
    setIsDragging(false);
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

      if (!response.ok || !response.body) throw new Error(`Request failed: ${response.status}`);

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
              setStage(
                event.message.toLowerCase().includes("reasoning") ||
                  event.message.toLowerCase().includes("deepseek")
                  ? "thinking"
                  : "scanning"
              );
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
          } catch { /* malformed chunk — skip */ }
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
  const meta = STAGE_META[stage];

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
      {/* ─── Hero text ──────────────────────────────────────────────────── */}
      <div className="text-center space-y-2 md:space-y-3">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight">
          CaptionCraft <span className="text-primary">AI</span>
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-xl mx-auto px-2">
          Upload an image, pick your vibe, and let AI write platform-perfect captions that actually sound like you.
        </p>
      </div>

      {/* ─── Main dual-pane grid ─────────────────────────────────────────── */}
      {/* Mobile: single column. md+: 12-col grid with sticky left pane */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">

        {/* LEFT PANE — upload + settings (sticky on desktop) */}
        <div className="md:col-span-5 lg:col-span-4 space-y-4 md:space-y-5">

          {/* Upload card */}
          <Card className="border-border/50 bg-card/50 backdrop-blur-xl">
            <CardHeader className="pb-3 px-4 md:px-6">
              <CardTitle className="text-base md:text-lg">1. Upload Visual</CardTitle>
            </CardHeader>
            <CardContent className="px-4 md:px-6 pb-4 md:pb-6">
              <div
                data-testid="drop-zone"
                className={`
                  border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300
                  flex flex-col items-center justify-center
                  ${previewUrl ? "p-1 min-h-[200px] sm:min-h-[240px]" : "p-6 sm:p-8 min-h-[180px] sm:min-h-[220px]"}
                  ${isDragging ? "border-primary bg-primary/10 scale-[1.02]" : "border-muted hover:border-primary/50"}
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById("image-upload")?.click()}
              >
                <input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                  data-testid="input-image"
                />
                {previewUrl ? (
                  <div className="relative w-full h-full rounded-lg overflow-hidden group">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-full h-[220px] sm:h-[260px] md:h-[240px] lg:h-[280px] object-cover rounded-lg"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                      <p className="text-white font-medium flex items-center gap-2 text-sm">
                        <RefreshCcw className="w-4 h-4" /> Replace Image
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 flex flex-col items-center">
                    <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      <UploadCloud className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="font-semibold text-base">Drag &amp; Drop</p>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">or tap to browse</p>
                    </div>
                    <p className="text-xs text-muted-foreground/60">JPG, PNG, WEBP supported</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Settings card */}
          <Card className="border-border/50 bg-card/50 backdrop-blur-xl">
            <CardHeader className="pb-3 px-4 md:px-6">
              <CardTitle className="text-base md:text-lg">2. Settings</CardTitle>
            </CardHeader>
            <CardContent className="px-4 md:px-6 pb-4 md:pb-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Platform</label>
                <Select value={platform} onValueChange={setPlatform} disabled={isPending}>
                  <SelectTrigger
                    className="w-full h-11 md:h-12 bg-background text-sm"
                    data-testid="select-platform"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p} className="h-10">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tone &amp; Vibe</label>
                <Select value={tone} onValueChange={setTone} disabled={isPending}>
                  <SelectTrigger
                    className="w-full h-11 md:h-12 bg-background text-sm"
                    data-testid="select-tone"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONES.map((t) => (
                      <SelectItem key={t} value={t} className="h-10">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                data-testid="button-generate"
                onClick={handleGenerate}
                disabled={!base64Image || isPending}
                className="w-full h-12 md:h-14 text-base font-bold shadow-[0_0_40px_-10px_hsl(var(--primary))] hover:shadow-[0_0_60px_-10px_hsl(var(--primary))] transition-shadow mt-1"
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
            </CardContent>
          </Card>
        </div>

        {/* RIGHT PANE — loading / results */}
        <div className="md:col-span-7 lg:col-span-8 space-y-4">

          {/* Empty state — desktop only hint */}
          {stage === "idle" && !result && (
            <div className="hidden md:flex flex-col items-center justify-center min-h-[400px] text-center gap-4 rounded-2xl border-2 border-dashed border-muted/50 p-12">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-primary/50" />
              </div>
              <div>
                <p className="text-lg font-semibold text-muted-foreground">Your captions will appear here</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Upload an image and hit Generate to get started</p>
              </div>
            </div>
          )}

          {/* Loading / pipeline state */}
          {isPending && (
            <div className="py-12 md:py-16 text-center space-y-5 animate-in slide-in-from-bottom-6 rounded-2xl border border-border/30 bg-card/30">
              {/* Animated rings */}
              <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-primary/20 rounded-full animate-ping" />
                <div className="absolute inset-2 border-4 border-primary/40 rounded-full animate-pulse" />
                <div className="relative">{meta.icon}</div>
              </div>

              <div className="space-y-2 px-4">
                <p className="text-base sm:text-lg font-semibold text-primary animate-pulse">
                  {stageMessage || meta.label}
                </p>
                {stage === "thinking" ? (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs sm:text-sm text-primary/80">
                    <BrainCircuit className="w-3.5 h-3.5 animate-pulse flex-shrink-0" />
                    <span>Thinking Context: AI is reasoning through your image profile...</span>
                  </div>
                ) : (
                  meta.sub && (
                    <p className="text-xs sm:text-sm text-muted-foreground">{meta.sub}</p>
                  )
                )}
              </div>

              {/* Stage dots */}
              <div className="flex items-center justify-center gap-3">
                {STAGE_STEPS.map((s, i) => (
                  <div
                    key={s}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      stage === s
                        ? "bg-primary scale-150 shadow-[0_0_8px_2px_hsl(var(--primary)/0.5)]"
                        : i < STAGE_STEPS.indexOf(stage)
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
              <div className="inline-flex flex-col items-center gap-3 px-5 py-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive max-w-md mx-auto w-full">
                <p className="font-semibold">Generation failed</p>
                <p className="text-sm text-destructive/80">{errorMsg}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerate}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 min-h-[44px] px-5"
                >
                  <RefreshCcw className="w-4 h-4 mr-2" /> Retry
                </Button>
              </div>
            </div>
          )}

          {/* Results */}
          {result && stage === "done" && (
            <div className="space-y-4 animate-in slide-in-from-bottom-8 duration-700">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
                  <Sparkles className="text-primary w-5 h-5" />
                  Generated Captions
                </h2>
                <Badge variant="outline" className="text-muted-foreground text-xs sm:text-sm">
                  {platform} · {tone}
                </Badge>
              </div>
              <div className="grid gap-4">
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
      </div>
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
    const fullText = `${currentCaption.text}\n\n${currentCaption.cta}\n\n${currentCaption.hashtags
      .map((h) => (h.startsWith("#") ? h : `#${h}`))
      .join(" ")}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    toast({ description: "Copied to clipboard!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefine = () => {
    refineCaption.mutate(
      {
        data: {
          captionText: currentCaption.text,
          platform,
          tone,
          hashtags: currentCaption.hashtags,
          cta: currentCaption.cta,
        },
      },
      {
        onSuccess: (data) => {
          setCurrentCaption(data);
          toast({ title: "Refined!", description: "Caption polished by Scout." });
        },
        onError: () => toast({ title: "Refinement failed", variant: "destructive" }),
      }
    );
  };

  const handleSave = () => {
    if (isSaved) return;
    saveCaption.mutate(
      {
        data: {
          text: currentCaption.text,
          hashtags: currentCaption.hashtags,
          cta: currentCaption.cta,
          platform,
          tone,
          imagePreviewBase64: base64Image,
        },
      },
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
    >
      <CardContent className="p-4 md:p-5 space-y-3">
        <div className="flex items-start gap-3">
          {/* Caption number badge */}
          <div className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
            {index + 1}
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <p className="whitespace-pre-wrap text-sm md:text-base leading-relaxed">
              {currentCaption.text}
            </p>

            {currentCaption.cta && (
              <p className="font-semibold text-primary text-sm">{currentCaption.cta}</p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {currentCaption.hashtags.map((tag, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="font-mono text-xs text-muted-foreground hover:text-foreground cursor-default"
                >
                  {tag.startsWith("#") ? tag : `#${tag}`}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Action row — all buttons min 44px tall */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50 gap-2">
          <div className="flex gap-2 flex-wrap">
            <Button
              data-testid={`button-copy-${index}`}
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className={`min-h-[44px] px-4 text-sm ${
                copied ? "text-green-500 border-green-500/50 bg-green-500/10" : ""
              }`}
            >
              {copied ? (
                <CheckCircle className="w-4 h-4 mr-1.5" />
              ) : (
                <Copy className="w-4 h-4 mr-1.5" />
              )}
              {copied ? "Copied!" : "Copy"}
            </Button>

            <Button
              data-testid={`button-refine-${index}`}
              variant="ghost"
              size="sm"
              onClick={handleRefine}
              disabled={refineCaption.isPending}
              className="min-h-[44px] px-3 text-sm"
            >
              {refineCaption.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCcw className="w-4 h-4 mr-1.5" />
              )}
              <span className="hidden sm:inline">Refine via</span> Scout
            </Button>
          </div>

          <Button
            data-testid={`button-save-${index}`}
            variant={isSaved ? "secondary" : "default"}
            size="sm"
            onClick={handleSave}
            disabled={isSaved || saveCaption.isPending}
            className="min-h-[44px] px-4 text-sm flex-shrink-0"
          >
            {saveCaption.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            {isSaved ? "Saved" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
