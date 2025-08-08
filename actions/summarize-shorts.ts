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
  const base = process.env.TRANSCRIPT_SERVER_URL || "http://127.0.0.1:5000";

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const res = await fetch(`${base}/transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        youtube_url: youtubeUrl,
      }),
      next: { revalidate: 0 },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.transcript) {
        return data.transcript.trim();
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

  const dont_wrap = "```markdown ```";

  const prompt = `
    {
      task: "Create notes from the youtube video based on the transcript",
      highlighting: "wrap the most important 1–3 word(s) or short phrase(s) in bold+italic markdown like this: ***critical phrase***. Those will be highlighted with a highligher, use this sporadically",
      structure: "
        Main point:
        - 1–2 bullets capturing the single most important takeaway (up to 3 for longer videos).
        Actionable key insights:
        - concise, bullets focused only on concrete, actionable steps or key insights.
        - you can use headings to structure the content, but don't overdo it
      ",
      addingImages: "![Alt text](Detailed explanation of the image, will be used to generate the image)",
      addingImagesGuide: "You can add images when you think it would add something to the note, you're not forced to add images, and you can add it to every single place if you want to",
      transcript: ${transcriptText},
      output_format: "markdown",
      output_language: "en",
      output_style: "concise, actionable, bullet points, tough love",
      output_sterilization: "your reponse will be direcly used, if it's not pure markdown, it will cause issues, so make sure to repond just with formated text, no comments, no explanations, no nothing",
      output_sanitization: "don't wrap the output in ${dont_wrap}",
      length: "short"
    }
  `;

  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
      temperature: 0.1,
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
