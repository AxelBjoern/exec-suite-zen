import { useRef } from "react";
import { toast } from "sonner";
import { FileText, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACCEPT_MIME,
  MAX_SIZE,
  mimeKind,
  fileToBase64,
  mediaSrc,
} from "@/lib/outbound-helpers";
import type { MediaValue } from "@/lib/outbound-helpers";

export function DropZone({
  value,
  onChange,
  onClear,
  disabled,
  dragOver,
  setDragOver,
  label = "Drop image, PDF or video here",
}: {
  value: MediaValue | null;
  onChange: (v: MediaValue) => void;
  onClear: () => void;
  disabled?: boolean;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const f = files[0];
    const kind = mimeKind(f.type);
    if (!kind) {
      toast.error("Only images (PNG/JPG/WebP), PDFs or MP4/MOV videos allowed.");
      return;
    }
    const limit = MAX_SIZE[kind];
    if (f.size > limit) {
      toast.error(`${kind} too large (> ${Math.round(limit / 1e6)} MB)`);
      return;
    }
    const b64 = await fileToBase64(f);
    onChange({
      kind,
      base64: b64,
      mime:
        f.type ||
        (kind === "image" ? "image/png" : kind === "pdf" ? "application/pdf" : "video/mp4"),
      filename: f.name,
    });
  }

  const src = value ? mediaSrc(value) : "";

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 border-dashed p-6 text-center transition",
        dragOver ? "border-primary bg-primary/5" : "border-border bg-background/40",
        disabled && "opacity-50 pointer-events-none",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={`${ACCEPT_MIME.image},${ACCEPT_MIME.pdf},${ACCEPT_MIME.video}`}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {value ? (
        <div className="flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {value.kind === "image" && src && (
            <img
              src={src}
              alt={value.filename}
              className="h-auto max-h-40 w-auto max-w-full rounded-md object-contain"
            />
          )}
          {value.kind === "video" && src && (
            <video src={src} controls className="max-h-60 w-full rounded-md" />
          )}
          {value.kind === "pdf" && (
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <FileText className="h-5 w-5 text-primary" />
              <span className="max-w-[200px] truncate">{value.filename}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="uppercase tracking-wider">{value.kind}</span>
            {value.base64 && <span>~{Math.round((value.base64.length * 0.75) / 1024)} KB</span>}
            {value.path && <span>stored</span>}
          </div>
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        </div>
      ) : (
        <>
          <Upload
            className={cn(
              "mx-auto mb-2 h-8 w-8",
              dragOver ? "text-primary" : "text-muted-foreground",
            )}
          />
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            PNG, JPG, WebP, PDF or MP4/MOV
          </p>
        </>
      )}
    </div>
  );
}
