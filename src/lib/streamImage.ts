import { createParser } from "eventsource-parser";
import { flushSync } from "react-dom";

type ImageEventPayload =
  | { type: "image_generation.partial_image"; b64_json: string; partial_image_index: number; created_at: number }
  | { type: "image_generation.completed"; b64_json: string; created_at: number };

export async function streamImage(
  endpoint: string,
  body: Record<string, unknown>,
  onFrame: (dataUrl: string, b64: string, isFinal: boolean) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Image generation failed: ${res.status} ${await res.text().catch(() => "")}`);
  }

  let sawCompleted = false;
  const parser = createParser({
    onEvent(event) {
      if (event.event !== "image_generation.partial_image" && event.event !== "image_generation.completed") return;
      let payload: ImageEventPayload;
      try { payload = JSON.parse(event.data) as ImageEventPayload; } catch { return; }
      const isFinal = event.event === "image_generation.completed";
      flushSync(() => {
        onFrame(`data:image/png;base64,${payload.b64_json}`, payload.b64_json, isFinal);
      });
      if (isFinal) sawCompleted = true;
    },
  });

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(value);
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  if (!sawCompleted) throw new Error("Image stream ended without a completed event");
}
