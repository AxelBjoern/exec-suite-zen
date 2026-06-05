// URL-safe base64 helpers for "?draft=" pre-fill links
export type DraftPayload =
  | { kind: "email"; to?: string; subject?: string; body?: string }
  | { kind: "reminder"; subject?: string; body?: string }
  | { kind: "linkedin"; text?: string };

function b64urlEncode(s: string) {
  if (typeof window === "undefined") {
    return Buffer.from(s, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string) {
  const pad = s.length % 4 ? s + "=".repeat(4 - (s.length % 4)) : s;
  const base = pad.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof window === "undefined") return Buffer.from(base, "base64").toString("utf-8");
  return decodeURIComponent(escape(atob(base)));
}

export function encodeDraft(p: DraftPayload): string {
  return b64urlEncode(JSON.stringify(p));
}
export function decodeDraft(qs: string | null | undefined): DraftPayload | null {
  if (!qs) return null;
  try {
    const obj = JSON.parse(b64urlDecode(qs));
    if (!obj || typeof obj !== "object" || !("kind" in obj)) return null;
    return obj as DraftPayload;
  } catch {
    return null;
  }
}
