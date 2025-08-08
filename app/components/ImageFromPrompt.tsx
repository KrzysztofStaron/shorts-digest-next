import OpenAI from "openai";

type Props = {
  alt: string;
  prompt: string;
};

export default async function ImageFromPrompt({ alt, prompt }: Props) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-sm p-4">
        Image generation unavailable: missing OPENAI_API_KEY
      </div>
    );
  }

  try {
    const client = new OpenAI({ apiKey });
    const res = await client.images.generate({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      response_format: "b64_json",
    });

    const b64 = res.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("No image returned");
    }

    return (
      <img
        src={`data:image/png;base64,${b64}`}
        alt={alt || "Generated image"}
        width={512}
        height={512}
        className="w-full max-w-md rounded-xl shadow-md border border-slate-200"
        loading="lazy"
      />
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate image";
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm p-4">
        Image generation failed: {message}
      </div>
    );
  }
}
