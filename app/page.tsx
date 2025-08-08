import { cookies } from "next/headers";
import { summarizeShorts } from "@/actions/summarize-shorts";

// Using cookies for transient UI state; no explicit action return value needed.

export default async function Page() {
  const jar = await cookies();
  const lastSummary = jar.get("last-summary")?.value ?? "";
  const lastError = jar.get("last-error")?.value ?? "";
  const lastUrl = jar.get("last-url")?.value ?? "";

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Shorts Digest</h1>
        <p className="text-sm text-neutral-500">
          Paste a YouTube Shorts link. We will fetch captions and generate a concise, actionable summary on the server.
        </p>
      </header>

      <section className="rounded-lg border p-4">
        <form action={summarizeShorts} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="url" className="text-sm font-medium">
              YouTube Shorts URL
            </label>
            <input
              id="url"
              name="url"
              type="url"
              required
              defaultValue={lastUrl}
              placeholder="https://www.youtube.com/shorts/… or https://youtu.be/…"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-black/90"
            >
              Summarize
            </button>
            <a
              href="https://www.youtube.com/shorts"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-neutral-600 underline-offset-4 hover:underline"
            >
              Find Shorts
            </a>
          </div>
        </form>
      </section>

      {lastError ? (
        <section className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {lastError}
        </section>
      ) : null}

      {lastSummary ? (
        <section className="mt-6 rounded-lg border p-4">
          <h2 className="mb-2 text-base font-semibold">Summary</h2>
          <pre className="whitespace-pre-wrap text-sm leading-6">{lastSummary}</pre>
        </section>
      ) : null}

      <footer className="mt-12 text-xs text-neutral-500">
        Requires server-side OPENAI_API_KEY. No data is stored beyond cookies on your device.
      </footer>
    </main>
  );
}
