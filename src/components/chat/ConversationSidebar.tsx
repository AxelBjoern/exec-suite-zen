import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, X, MessageSquare, Pencil, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatRelative, type Conversation } from "@/lib/chat-helpers";

type Props = {
  isOwner: boolean;
  conversations: Conversation[];
  activeId: string | null;
  setActiveId: (id: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  onNew: () => void;
  newPending: boolean;
  onRename: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
};

export function ConversationSidebar({
  isOwner,
  conversations,
  activeId,
  setActiveId,
  sidebarOpen,
  setSidebarOpen,
  onNew,
  newPending,
  onRename,
  onDelete,
}: Props) {
  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 max-w-[85vw] shrink-0 border-r border-border/40 bg-card md:bg-card/30 backdrop-blur flex flex-col transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="px-4 py-4 border-b border-border/40 flex items-center gap-2">
          <Link
            to={isOwner ? "/terminal" : "/"}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={isOwner ? "Back to terminal" : "Back to hub"}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              VDNX
            </div>
            <div className="text-sm font-semibold tracking-tight">History</div>
          </div>
          <ThemeToggle />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onNew}
            disabled={newPending}
            title="New conversation"
            aria-label="New conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              No conversations yet. Start chatting or click <Plus className="inline h-3 w-3" /> to create one.
            </div>
          )}
          {conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <div
                key={c.id}
                className={`group relative mx-2 mb-1 rounded-md transition-colors ${
                  active
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-muted/50 border border-transparent"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(c.id);
                    setSidebarOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 pr-14"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="text-sm font-medium truncate">{c.title}</div>
                  </div>
                  <div className="mt-0.5 pl-5 text-[10px] text-muted-foreground">
                    {formatRelative(c.updated_at)}
                  </div>
                </button>
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRename(c);
                    }}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-background/80"
                    aria-label="Rename"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(c);
                    }}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-background/80"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
