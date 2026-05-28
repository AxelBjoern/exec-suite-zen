// /video <prompt> — generate a clip with Kling v3.0 Std via Replicate.
// Routed from sendCeoMessage. Stores the resulting MP4 in the
// `chat-uploads` bucket and links it as an attachment on the assistant
// message so the chat UI renders it inline.

import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const REPLICATE_MODEL = "kwaivgi/kling-v3.0-std";
const POLL_INTERVAL_MS = 5000;
const MAX_TOTAL_WAIT_MS = 180_000; // 3 minutes

type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
};

async function startPrediction(token: string, prompt: string): Promise<ReplicatePrediction> {
  const res = await fetch(`https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({ input: { prompt, duration: 5 } }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Kling v3.0 Std request failed (${res.status}): ${body.slice(0, 400)}`);
  }
  return JSON.parse(body) as ReplicatePrediction;
}

async function fetchPrediction(token: string, id: string): Promise<ReplicatePrediction> {
  const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Kling v3.0 Std poll failed (${res.status})`);
  }
  return (await res.json()) as ReplicatePrediction;
}

function extractOutputUrl(p: ReplicatePrediction): string | null {
  if (!p.output) return null;
  if (typeof p.output === "string") return p.output;
  if (Array.isArray(p.output) && p.output.length) return p.output[0];
  return null;
}

export const generateCeoVideo = createServerFn({ method: "POST" })
  .inputValidator((d: { prompt: string; conversationId?: string | null }) => {
    const prompt = (d?.prompt ?? "").trim();
    if (!prompt) throw new Error("Video prompt is empty");
    if (prompt.length > 2000) throw new Error("Video prompt too long");
    return { prompt, conversationId: d?.conversationId ?? null };
  })
  .handler(async ({ data }) => {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new Error("REPLICATE_API_TOKEN missing — add it in project secrets.");

    // Ensure conversation
    let conversationId = data.conversationId;
    if (!conversationId) {
      const { data: convo, error } = await supabaseAdmin
        .from("ceo_conversations")
        .insert({ title: data.prompt.slice(0, 80) })
        .select("id")
        .single();
      if (error) throw error;
      conversationId = convo.id;
    }

    // Save the user's command as a normal user message
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from("ceo_chat_messages")
      .insert({
        role: "user",
        content: `/video ${data.prompt}`,
        conversation_id: conversationId,
      })
      .select("id, role, content, created_at")
      .single();
    if (userErr) throw userErr;

    // Kick off + poll Replicate (Kling v3.0 Std typically finishes in 30-120s)
    let prediction = await startPrediction(token, data.prompt);
    const startedAt = Date.now();
    while (
      prediction.status !== "succeeded" &&
      prediction.status !== "failed" &&
      prediction.status !== "canceled"
    ) {
      if (Date.now() - startedAt > MAX_TOTAL_WAIT_MS) {
        throw new Error("Kling v3.0 Std timed out. Try again — the model may be cold.");
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      prediction = await fetchPrediction(token, prediction.id);
    }

    if (prediction.status !== "succeeded") {
      throw new Error(`Kling v3.0 Std ${prediction.status}: ${prediction.error ?? "no detail"}`);
    }

    const outputUrl = extractOutputUrl(prediction);
    if (!outputUrl) throw new Error("Kling v3.0 Std returned no video output.");

    // Download the MP4
    const mp4Res = await fetch(outputUrl);
    if (!mp4Res.ok) throw new Error(`Failed to download generated video (${mp4Res.status})`);
    const mp4Bytes = new Uint8Array(await mp4Res.arrayBuffer());

    // Upload into chat-uploads bucket
    const storagePath = `videos/${conversationId}/${prediction.id}.mp4`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("chat-uploads")
      .upload(storagePath, mp4Bytes, { contentType: "video/mp4", upsert: true });
    if (upErr) throw upErr;

    // Assistant message (placeholder text; the attachment carries the video)
    const { data: asstRow, error: asstErr } = await supabaseAdmin
      .from("ceo_chat_messages")
      .insert({
        role: "assistant",
        content: `Generated 5s clip with Kling v3.0 Std.\n\n> ${data.prompt}`,
        conversation_id: conversationId,
      })
      .select("id, role, content, created_at")
      .single();
    if (asstErr) throw asstErr;

    const filename = `${data.prompt.slice(0, 60).replace(/[^a-zA-Z0-9._-]+/g, "_") || "clip"}.mp4`;
    const { data: attRow, error: attErr } = await supabaseAdmin
      .from("ceo_chat_attachments")
      .insert({
        message_id: asstRow.id,
        filename,
        mime_type: "video/mp4",
        size_bytes: mp4Bytes.length,
        storage_path: storagePath,
        extracted_text: "",
      })
      .select("id, filename, mime_type, size_bytes")
      .single();
    if (attErr) throw attErr;

    // Signed URL for immediate playback
    const { data: signed } = await supabaseAdmin.storage
      .from("chat-uploads")
      .createSignedUrl(storagePath, 3600);

    // Bump conversation
    await supabaseAdmin
      .from("ceo_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return {
      conversation_id: conversationId,
      user: userRow,
      assistant: {
        ...asstRow,
        conversation_id: conversationId,
        attachments: [
          {
            id: attRow.id,
            filename: attRow.filename,
            mimeType: attRow.mime_type,
            sizeBytes: attRow.size_bytes,
            url: signed?.signedUrl ?? null,
          },
        ],
      },
    };
  });
