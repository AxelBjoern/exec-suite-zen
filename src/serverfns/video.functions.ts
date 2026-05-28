// /video <visual prompt> [| <narration>] — generate a clip with Kling v3.0 Std via OpenRouter.
// Optional narration is synthesized with ElevenLabs (voice: Sarah) and attached
// as a separate audio track. The chat UI syncs the audio to the video element.

import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const OPENROUTER_VIDEO_URL = "https://openrouter.ai/api/v1/videos";
const KLING_MODEL = "kwaivgi/kling-v3.0-std";
const POLL_INTERVAL_MS = 5000;
const MAX_TOTAL_WAIT_MS = 240_000; // 4 minutes
const ELEVENLABS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah

type OpenRouterVideoJob = {
  id: string;
  polling_url?: string;
  status?: string;
};

type OpenRouterVideoStatus = {
  id?: string;
  status: "queued" | "processing" | "completed" | "failed" | string;
  unsigned_urls?: string[];
  signed_urls?: string[];
  urls?: string[];
  error?: string | { message?: string } | null;
};

async function startKlingJob(token: string, prompt: string): Promise<OpenRouterVideoJob> {
  const res = await fetch(OPENROUTER_VIDEO_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://lovable.app",
      "X-Title": "VDNX Agents",
    },
    body: JSON.stringify({ model: KLING_MODEL, prompt }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Kling v3.0 Std request failed (${res.status}): ${body.slice(0, 400)}`);
  }
  const json = JSON.parse(body) as OpenRouterVideoJob;
  if (!json.id) throw new Error("Kling v3.0 Std returned no job id.");
  return json;
}

async function pollKlingJob(token: string, job: OpenRouterVideoJob): Promise<OpenRouterVideoStatus> {
  const url = job.polling_url ?? `${OPENROUTER_VIDEO_URL}/${job.id}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Kling v3.0 Std poll failed (${res.status})`);
  }
  return (await res.json()) as OpenRouterVideoStatus;
}

function extractVideoUrl(s: OpenRouterVideoStatus): string | null {
  return s.unsigned_urls?.[0] ?? s.signed_urls?.[0] ?? s.urls?.[0] ?? null;
}

async function synthesizeNarration(text: string): Promise<Uint8Array> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY missing — add it in project secrets.");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true, speed: 1.0 },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${err.slice(0, 300)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export const generateCeoVideo = createServerFn({ method: "POST" })
  .inputValidator((d: { prompt: string; conversationId?: string | null }) => {
    const raw = (d?.prompt ?? "").trim();
    if (!raw) throw new Error("Video prompt is empty");
    if (raw.length > 4000) throw new Error("Video prompt too long");

    // Split on first unescaped `|`
    const pipeIdx = raw.indexOf("|");
    const visual = (pipeIdx >= 0 ? raw.slice(0, pipeIdx) : raw).trim();
    const narration = pipeIdx >= 0 ? raw.slice(pipeIdx + 1).trim() : "";
    if (!visual) throw new Error("Visual prompt (before |) is empty");
    if (narration.length > 2000) throw new Error("Narration text too long (max 2000 chars)");

    return {
      visual,
      narration,
      conversationId: d?.conversationId ?? null,
    };
  })
  .handler(async ({ data }) => {
    const token = process.env.OPENROUTER_API_KEY;
    if (!token) throw new Error("OPENROUTER_API_KEY missing — add it in project secrets.");

    // Ensure conversation
    let conversationId = data.conversationId;
    if (!conversationId) {
      const { data: convo, error } = await supabaseAdmin
        .from("ceo_conversations")
        .insert({ title: data.visual.slice(0, 80) })
        .select("id")
        .single();
      if (error) throw error;
      conversationId = convo.id;
    }

    // Save user's command verbatim
    const userContent = data.narration
      ? `/video ${data.visual} | ${data.narration}`
      : `/video ${data.visual}`;
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from("ceo_chat_messages")
      .insert({ role: "user", content: userContent, conversation_id: conversationId })
      .select("id, role, content, created_at")
      .single();
    if (userErr) throw userErr;

    // Run Kling + (optionally) ElevenLabs in parallel
    const klingPromise = (async () => {
      const job = await startKlingJob(token, data.visual);
      let status: OpenRouterVideoStatus = { status: job.status ?? "queued" };
      const startedAt = Date.now();
      while (status.status !== "completed" && status.status !== "failed") {
        if (Date.now() - startedAt > MAX_TOTAL_WAIT_MS) {
          throw new Error("Kling v3.0 Std timed out. Try again — the model may be cold.");
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        status = await pollKlingJob(token, job);
      }
      if (status.status !== "completed") {
        const detail = typeof status.error === "string" ? status.error : status.error?.message ?? "no detail";
        throw new Error(`Kling v3.0 Std ${status.status}: ${detail}`);
      }
      const outputUrl = extractVideoUrl(status);
      if (!outputUrl) throw new Error("Kling v3.0 Std returned no video output.");
      const mp4Res = await fetch(outputUrl);
      if (!mp4Res.ok) throw new Error(`Failed to download generated video (${mp4Res.status})`);
      return {
        predictionId: job.id,
        bytes: new Uint8Array(await mp4Res.arrayBuffer()),
      };
    })();

    const narrationPromise = data.narration
      ? synthesizeNarration(data.narration)
      : Promise.resolve<Uint8Array | null>(null);

    const [video, narrationBytes] = await Promise.all([klingPromise, narrationPromise]);

    // Upload video
    const videoPath = `videos/${conversationId}/${video.predictionId}.mp4`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("chat-uploads")
      .upload(videoPath, video.bytes, { contentType: "video/mp4", upsert: true });
    if (upErr) throw upErr;

    // Upload narration (if any) — filename prefixed `narration_` so the UI pairs it with the video
    let audioPath: string | null = null;
    if (narrationBytes) {
      audioPath = `videos/${conversationId}/${video.predictionId}_narration.mp3`;
      const { error: aErr } = await supabaseAdmin.storage
        .from("chat-uploads")
        .upload(audioPath, narrationBytes, { contentType: "audio/mpeg", upsert: true });
      if (aErr) throw aErr;
    }

    // Assistant message
    const assistantText = data.narration
      ? `Generated 5s clip with Kling v3.0 Std + ElevenLabs narration.\n\n> ${data.visual}\n> narration: ${data.narration}`
      : `Generated 5s clip with Kling v3.0 Std.\n\n> ${data.visual}`;
    const { data: asstRow, error: asstErr } = await supabaseAdmin
      .from("ceo_chat_messages")
      .insert({ role: "assistant", content: assistantText, conversation_id: conversationId })
      .select("id, role, content, created_at")
      .single();
    if (asstErr) throw asstErr;

    const safeName = data.visual.slice(0, 60).replace(/[^a-zA-Z0-9._-]+/g, "_") || "clip";

    // Insert video attachment
    const { data: videoAtt, error: vAttErr } = await supabaseAdmin
      .from("ceo_chat_attachments")
      .insert({
        message_id: asstRow.id,
        filename: `${safeName}.mp4`,
        mime_type: "video/mp4",
        size_bytes: video.bytes.length,
        storage_path: videoPath,
        extracted_text: "",
      })
      .select("id, filename, mime_type, size_bytes")
      .single();
    if (vAttErr) throw vAttErr;

    const { data: videoSigned } = await supabaseAdmin.storage
      .from("chat-uploads")
      .createSignedUrl(videoPath, 3600);

    const attachments: Array<{
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      url: string | null;
    }> = [
      {
        id: videoAtt.id,
        filename: videoAtt.filename,
        mimeType: videoAtt.mime_type,
        sizeBytes: videoAtt.size_bytes,
        url: videoSigned?.signedUrl ?? null,
      },
    ];

    // Insert narration attachment + signed URL
    if (audioPath && narrationBytes) {
      const { data: audioAtt, error: aAttErr } = await supabaseAdmin
        .from("ceo_chat_attachments")
        .insert({
          message_id: asstRow.id,
          filename: `narration_${safeName}.mp3`,
          mime_type: "audio/mpeg",
          size_bytes: narrationBytes.length,
          storage_path: audioPath,
          extracted_text: data.narration,
        })
        .select("id, filename, mime_type, size_bytes")
        .single();
      if (aAttErr) throw aAttErr;
      const { data: audioSigned } = await supabaseAdmin.storage
        .from("chat-uploads")
        .createSignedUrl(audioPath, 3600);
      attachments.push({
        id: audioAtt.id,
        filename: audioAtt.filename,
        mimeType: audioAtt.mime_type,
        sizeBytes: audioAtt.size_bytes,
        url: audioSigned?.signedUrl ?? null,
      });
    }

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
        attachments,
      },
    };
  });
