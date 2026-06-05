/**
 * Client-safe App User Connector helper. No secrets — safe in browser bundles.
 */
export interface AppUserOAuthResult {
  success: boolean;
  connectorId: string;
  connectionId?: string;
  error?: string;
}

const OAUTH_MESSAGE_TYPE = "appUserConnectorOAuth";

export async function connectAppUser(opts: {
  connectorId: string;
  gatewayBaseUrl: string;
  start: (targetOrigin: string) => Promise<{ authorizationUrl: string }>;
}): Promise<AppUserOAuthResult> {
  const { connectorId, gatewayBaseUrl, start } = opts;
  const gatewayOrigin = new URL(gatewayBaseUrl).origin;
  const targetOrigin = window.location.origin;

  const popup = window.open("", "lovable-oauth", "width=600,height=720");
  if (!popup) return { success: false, connectorId, error: "Popup blocked. Allow popups and try again." };

  try {
    popup.document.write(`<!doctype html><html><head><title>Connecting…</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#0b1020;color:#f3f4f6;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}div{max-width:28rem}p{opacity:.8;line-height:1.5}</style></head><body><div><h1>Connecting…</h1><p>Waiting for the sign-in page to open.</p></div></body></html>`);
    popup.document.close();
  } catch {
    // Ignore cross-window write failures.
  }

  let authorizationUrl: string;
  try {
    authorizationUrl = (await start(targetOrigin)).authorizationUrl;
  } catch (e) {
    try {
      popup.document.body.innerHTML = `<div style="font-family:system-ui,-apple-system,sans-serif;padding:24px;line-height:1.5"><h1 style="margin:0 0 12px">Connection unavailable</h1><p>${e instanceof Error ? e.message : "Failed to start OAuth"}</p><p>You can close this window.</p></div>`;
    } catch {
      // Ignore cross-window write failures.
    }
    popup.close();
    return { success: false, connectorId, error: e instanceof Error ? e.message : "Failed to start OAuth" };
  }
  popup.location.href = authorizationUrl;

  return await new Promise<AppUserOAuthResult>((resolve) => {
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== gatewayOrigin) return;
      const data = event.data;
      if (!data || data.type !== OAUTH_MESSAGE_TYPE || data.connector_id !== connectorId) return;
      cleanup();
      popup.close();
      resolve(
        data.success && data.connection_id
          ? { success: true, connectorId, connectionId: data.connection_id }
          : { success: false, connectorId, error: data.error ?? "OAuth failed" },
      );
    };
    window.addEventListener("message", onMessage);
    const timer = setInterval(() => {
      if (popup.closed) { cleanup(); resolve({ success: false, connectorId, error: "Sign in was cancelled" }); }
    }, 500);
  });
}
