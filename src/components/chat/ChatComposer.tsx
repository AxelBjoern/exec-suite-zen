import { RefObject } from "react";
import { toast } from "sonner";
import {
  Send,
  Paperclip,
  X,
  FileText,
  FileDown,
  FileType,
  ClipboardPaste,
} from "lucide-react";
import { VdnxLoader } from "@/components/VdnxLoader";
import { Button } from "@/components/ui/button";
import { ACCEPTED_TYPES, formatBytes, type Attachment } from "@/lib/chat-helpers";

type Props = {
  input: string;
  setInput: (v: string | ((p: string) => string)) => void;
  attachments: Attachment[];
  setAttachments: (fn: (prev: Attachment[]) => Attachment[]) => void;
  uploading: boolean;
  pending: boolean;
  canSend: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
  onStop: () => void;
  onFiles: (files: FileList | null) => void;
  onGenerateDoc: (kind: "pdf" | "docx") => void;
  swarmSlot?: React.ReactNode;
  swarmActive?: boolean;
};

export function ChatComposer({
  input,
  setInput,
  attachments,
  setAttachments,
  uploading,
  pending,
  canSend,
  inputRef,
  fileInputRef,
  onSubmit,
  onStop,
  onFiles,
  onGenerateDoc,
  swarmSlot,
  swarmActive,
}: Props) {
  return (
    <div className="border-t border-border/40 bg-card/40 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="max-w-3xl mx-auto p-4"
      >
        {(attachments.length > 0 || uploading) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{a.filename}</span>
                <span className="text-muted-foreground">{formatBytes(a.sizeBytes)}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${a.filename}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {uploading && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1">
                <VdnxLoader size="xs" />
                <span className="text-xs text-muted-foreground">Extracting…</span>
              </div>
            )}
          </div>
        )}
        <div className="relative rounded-xl border border-border bg-background focus-within:border-primary/60 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            onPaste={(e) => {
              const cd = e.clipboardData;
              if (!cd) return;
              const collected: File[] = [];
              if (cd.files && cd.files.length > 0) {
                collected.push(...Array.from(cd.files));
              }
              if (collected.length === 0 && cd.items) {
                for (const it of Array.from(cd.items)) {
                  if (it.kind === "file") {
                    const f = it.getAsFile();
                    if (f) {
                      const named = f.name
                        ? f
                        : new File(
                            [f],
                            `pasted-${Date.now()}.${(f.type.split("/")[1] || "png").split("+")[0]}`,
                            { type: f.type || "image/png" },
                          );
                      collected.push(named);
                    }
                  }
                }
              }
              if (collected.length > 0) {
                e.preventDefault();
                const dt = new DataTransfer();
                collected.forEach((f) => dt.items.add(f));
                onFiles(dt.files);
              }
            }}
            placeholder={swarmActive ? "Swarm mode — multiple models will draft, one will synthesize…" : "Message the CEO… (Enter to send, Shift+Enter for newline)"}
            rows={2}
            disabled={pending}
            className={`w-full resize-none bg-transparent pt-3 pb-12 px-3 pr-14 text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-60 ${swarmActive ? "ring-1 ring-primary/40 rounded-xl" : ""}`}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
          <div className="absolute left-1.5 bottom-1.5 flex items-center gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || pending}
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              aria-label="Attach document"
              title="Attach .pdf, .docx, .txt, .md"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => onGenerateDoc("pdf")}
              disabled={pending}
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              aria-label="Generate PDF"
              title="Generate PDF (or type /pdf <topic>)"
            >
              <FileDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => onGenerateDoc("docx")}
              disabled={pending}
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              aria-label="Generate Word document"
              title="Generate DOCX (or type /docx <topic>)"
            >
              <FileType className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (!text) {
                    toast.info("Clipboard is empty");
                    return;
                  }
                  setInput((prev) => prev + text);
                  requestAnimationFrame(() => inputRef.current?.focus());
                } catch {
                  toast.error("Paste failed — allow clipboard access");
                }
              }}
              disabled={pending}
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              aria-label="Paste from clipboard"
              title="Paste from clipboard"
            >
              <ClipboardPaste className="h-4 w-4" />
            </Button>
            {swarmSlot && <div className="ml-1 pl-1 border-l border-border/60">{swarmSlot}</div>}
          </div>
          {pending ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generation"
              title="Stop generating"
              className="absolute right-2 bottom-2 h-9 w-9 rounded-full flex items-center justify-center bg-foreground text-background shadow-sm transition-all hover:scale-105 hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-sm bg-background/40" />
                <span className="relative h-2.5 w-2.5 rounded-[2px] bg-background" />
              </span>
            </button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!canSend}
              className="absolute right-2 bottom-2 h-9 w-9"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
