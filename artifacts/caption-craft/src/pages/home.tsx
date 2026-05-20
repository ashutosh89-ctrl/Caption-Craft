import { useState, useRef, useEffect } from "react";
import { useGenerateCaptions, useRefineCaption, useSaveCaption, getListSavedCaptionsQueryKey, getGetCaptionStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UploadCloud, Sparkles, Copy, CheckCircle, RefreshCcw, Save, Loader2, BrainCircuit, ScanEye } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";

const PLATFORMS = ["Instagram", "LinkedIn", "YouTube"];
const TONES = ["Desi/Hinglish", "Funny", "Professional", "Savage"];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [base64Image, setBase64Image] = useState<string | null>(null);
  
  const [platform, setPlatform] = useState("Instagram");
  const [tone, setTone] = useState("Desi/Hinglish");
  
  const [isDragging, setIsDragging] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const generateCaptions = useGenerateCaptions();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please upload an image file", variant: "destructive" });
      return;
    }
    setFile(file);
    setPreviewUrl(URL.createObjectURL(file));

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const base64 = result.split(",")[1];
      setBase64Image(base64);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (generateCaptions.isPending) {
      setLoadingStage(1);
      interval = setInterval(() => {
        setLoadingStage((prev) => (prev === 1 ? 2 : prev));
      }, 1500);
    } else {
      setLoadingStage(0);
    }
    return () => clearInterval(interval);
  }, [generateCaptions.isPending]);

  const handleGenerate = () => {
    if (!base64Image || !file) return;

    generateCaptions.mutate({
      data: {
        imageBase64: base64Image,
        imageType: file.type,
        platform,
        tone
      }
    }, {
      onError: () => {
        toast({ title: "Failed to generate", description: "An error occurred.", variant: "destructive" });
      }
    });
  };

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
        <Card className="border-border/50 bg-card/50 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>1. Upload Visual</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[300px]
                ${isDragging ? 'border-primary bg-primary/10 scale-105' : 'border-muted hover:border-primary/50'}
                ${previewUrl ? 'p-2' : ''}
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('image-upload')?.click()}
            >
              <input 
                id="image-upload" 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileSelect}
              />
              
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
                    <p className="font-semibold text-lg">Drag & Drop</p>
                    <p className="text-sm text-muted-foreground">or click to browse</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 backdrop-blur-xl flex flex-col">
          <CardHeader>
            <CardTitle>2. Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 flex-1 flex flex-col">
            <div className="space-y-3">
              <label className="text-sm font-medium">Platform</label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-full h-12 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-3">
              <label className="text-sm font-medium">Tone & Vibe</label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="w-full h-12 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-auto pt-6">
              <Button 
                onClick={handleGenerate}
                disabled={!base64Image || generateCaptions.isPending}
                className="w-full h-14 text-lg font-bold shadow-[0_0_40px_-10px_hsl(var(--primary))] transition-shadow hover:shadow-[0_0_60px_-10px_hsl(var(--primary))]"
                size="lg"
              >
                {generateCaptions.isPending ? (
                  "Crafting Magic..."
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-2" />
                    Generate Captions
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {generateCaptions.isPending && (
        <div className="py-16 text-center space-y-6 animate-in slide-in-from-bottom-8">
          <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 border-4 border-primary/30 rounded-full animate-ping"></div>
            <div className="absolute inset-2 border-4 border-primary rounded-full animate-pulse"></div>
            {loadingStage === 1 ? <ScanEye className="w-8 h-8 text-primary animate-pulse" /> : <BrainCircuit className="w-8 h-8 text-primary animate-pulse" />}
          </div>
          <h3 className="text-xl font-medium animate-pulse text-primary">
            {loadingStage === 1 ? "Maverick is scanning visuals..." : "DeepSeek R1 is reasoning captions..."}
          </h3>
        </div>
      )}

      {generateCaptions.data && !generateCaptions.isPending && (
        <div className="space-y-6 animate-in slide-in-from-bottom-12 duration-700">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="text-primary" /> Generated Captions
          </h2>
          <div className="grid gap-6">
            {generateCaptions.data.captions.map((caption, i) => (
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

function CaptionCard({ caption, index, platform, tone, base64Image }: any) {
  const [copied, setCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const refineCaption = useRefineCaption();
  const saveCaption = useSaveCaption();

  const [currentCaption, setCurrentCaption] = useState(caption);

  const handleCopy = () => {
    const fullText = `${currentCaption.text}\n\n${currentCaption.cta}\n\n${currentCaption.hashtags.join(" ")}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    toast({ description: "Copied to clipboard!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefine = () => {
    refineCaption.mutate({
      data: {
        captionText: currentCaption.text,
        platform,
        tone,
        hashtags: currentCaption.hashtags,
        cta: currentCaption.cta
      }
    }, {
      onSuccess: (data) => {
        setCurrentCaption(data);
        toast({ title: "Refined!", description: "Caption has been polished." });
      }
    });
  };

  const handleSave = () => {
    if (isSaved) return;
    saveCaption.mutate({
      data: {
        text: currentCaption.text,
        hashtags: currentCaption.hashtags,
        cta: currentCaption.cta,
        platform,
        tone,
        imagePreviewBase64: base64Image
      }
    }, {
      onSuccess: () => {
        setIsSaved(true);
        toast({ title: "Saved to Gallery!" });
        queryClient.invalidateQueries({ queryKey: getListSavedCaptionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCaptionStatsQueryKey() });
      }
    });
  };

  return (
    <Card className="border-border/50 bg-card hover:border-primary/30 transition-colors" style={{ animationDelay: `${index * 150}ms` }}>
      <CardContent className="p-6 space-y-4">
        <div className="whitespace-pre-wrap text-lg">
          {currentCaption.text}
        </div>
        
        {currentCaption.cta && (
          <div className="font-medium text-primary">
            {currentCaption.cta}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {currentCaption.hashtags.map((tag: string, i: number) => (
            <Badge key={i} variant="secondary" className="font-mono text-xs text-muted-foreground hover:text-foreground">
              {tag}
            </Badge>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className={copied ? "text-green-500 border-green-500/50 bg-green-500/10" : ""}>
              {copied ? <CheckCircle className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleRefine} disabled={refineCaption.isPending}>
              {refineCaption.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
              Refine & Re-Polish
            </Button>
          </div>
          <Button variant={isSaved ? "secondary" : "default"} size="sm" onClick={handleSave} disabled={isSaved || saveCaption.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {isSaved ? "Saved" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
