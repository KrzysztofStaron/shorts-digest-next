import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import OpenAI from "openai";

function extractVideoId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
      const v = u.searchParams.get("v");
      if (v) return v;
    }
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "");
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchTranscriptTextFromServer(videoId: string): Promise<string> {
  const base = process.env.TRANSCRIPT_SERVER_URL || "http://127.0.0.1:8000";

  // Try txt first
  const urlTxt = new URL("/transcript", base);
  urlTxt.searchParams.set("id", videoId);
  urlTxt.searchParams.set("format", "txt");
  ["en", "en-US", "en-GB"].forEach(lang => urlTxt.searchParams.append("lang", lang));

  try {
    const res = await fetch(urlTxt.toString(), { next: { revalidate: 0 } });
    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (Array.isArray((data as any)?.snippets)) {
          return ((data as any).snippets as any[]).map((s: any) => s.text).join(" ");
        }
        return "";
      }
      const body = (await res.text()).trim();
      return body;
    }
  } catch {
    // continue to JSON fallback
  }

  // Fallback to JSON
  const urlJson = new URL("/transcript", base);
  urlJson.searchParams.set("id", videoId);
  urlJson.searchParams.set("format", "json");
  ["en", "en-US", "en-GB"].forEach(lang => urlJson.searchParams.append("lang", lang));

  try {
    const res = await fetch(urlJson.toString(), { next: { revalidate: 0 } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray((data as any)?.snippets)) {
        return ((data as any).snippets as any[]).map((s: any) => s.text).join(" ");
      }
    }
  } catch {
    // ignored
  }

  return "";
}

export async function summarizeShorts(formData: FormData): Promise<void> {
  "use server";

  const url = String(formData.get("url") || "").trim();
  const jar = await cookies();

  if (!url) {
    jar.set("last-error", "Please provide a YouTube Shorts URL.");
    jar.delete("last-summary");
    revalidatePath("/");
    return;
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    jar.set("last-error", "Invalid YouTube link.");
    jar.delete("last-summary");
    revalidatePath("/");
    return;
  }

  let transcriptText = "";
  try {
    transcriptText = await fetchTranscriptTextFromServer(videoId);
  } catch {
    // ignored
  }

  if (!transcriptText) {
    jar.set(
      "last-error",
      "No transcript found for this Shorts. Currently only videos with available captions are supported."
    );
    jar.delete("last-summary");
    revalidatePath("/");
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    jar.set("last-error", "OPENAI_API_KEY is not configured on the server.");
    jar.delete("last-summary");
    revalidatePath("/");
    return;
  }

  const client = new OpenAI({ apiKey });

  const prompt = [
    "Using the following YouTube Shorts transcript, produce two sections in English only.",
    "",
    "Main point(s):",
    "- 1–2 bullets capturing the single most important takeaway (up to 3 for longer videos).",
    "",
    "Actionable key insights:",
    "- 3–7 concise, imperative bullets focused only on concrete, actionable steps or key insights.",
    "",
    "Rules:",
    '- Bullets only (use "- "), no intro or outro.',
    "- No fluff, no repetition, no emojis, no links.",
    "- Be specific and practical.",
    "",
    "Transcript:",
    transcriptText,
  ].join("\n");

  try {
    const response = await client.responses.create({
      model: "gpt-4.1-nano-2025-04-14",
      input: prompt,
      temperature: 0.2,
      max_output_tokens: 500,
    });

    const summary = (response as any).output_text?.trim?.() ?? "";
    const finalText = summary || "No content generated.";

    jar.set("last-summary", finalText, { maxAge: 60 * 10 });
    jar.set("last-url", url, { maxAge: 60 * 60 * 24 });
    jar.delete("last-error");
    revalidatePath("/");
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate summary.";
    jar.set("last-error", message);
    jar.delete("last-summary");
    revalidatePath("/");
    return;
  }
}
