## YouTube Video Digest

Turn YouTube videos into concise, actionable summaries with AI-powered transcription and summarization. Paste a YouTube link, get clean notes with highlighted key phrases, optionally generate illustrative images, and export to PDF.

### Features

- **Paste URL → Transcript → Summary**: Local Flask service downloads audio via `yt-dlp`, transcribes with OpenAI; Next.js summarizes and renders.
- **Actionable notes**: Key phrases rendered with a subtle `<mark>` highlight for skimmability.
- **Optional images**: Add Markdown images like `![Alt](Prompt to generate the image)` and the app will generate and inline them.
- **Export to PDF**: One-click export using `html2canvas` + `jsPDF`.
- **Local caching**: Transcripts cached under `cache/transcripts/` for quick repeats.

### Tech stack

- **Frontend**: Next.js App Router (v15), React 19, Tailwind CSS v4
- **Server actions**: OpenAI Responses API for summarization
- **Image generation**: OpenAI Images API (DALL·E 3)
- **PDF export**: `html2canvas`, `jsPDF`
- **Transcript service**: Python + Flask, `yt-dlp`, OpenAI audio transcription (`gpt-4o-mini-transcribe`)

### How it works

1. Submit a YouTube URL in the UI.
2. Server action calls the local transcript service to fetch plain-text transcript.
3. The transcript is summarized via OpenAI and rendered with headings, lists, highlights, and optional images.

```22:49:actions/summarize-shorts.ts
async function fetchTranscriptTextFromServer(videoId: string): Promise<string> {
  const base = process.env.TRANSCRIPT_SERVER_URL || "http://127.0.0.1:5000";
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(`${base}/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ youtube_url: youtubeUrl }) });
  // ...
}
```

```76:104:server.py
@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    # Expect JSON: { "youtube_url": "https://..." }
    # Downloads audio via yt-dlp, calls OpenAI transcription, returns { success, transcript, ... }
    # ...
```

## Requirements

- Node.js 18+ and `pnpm`
- Python 3.10+
- `ffmpeg` on PATH (required by `yt-dlp`)
- OpenAI API key

### Install `ffmpeg` on Windows

- Chocolatey: `choco install ffmpeg` (elevated PowerShell)
- Scoop: `scoop install ffmpeg`
- Or download binaries and add to PATH

## Setup

### 1) Frontend

```powershell
pnpm install
```

Create `.env.local`:

```ini
OPENAI_API_KEY=your_openai_api_key
# If Flask runs on a non-default port, set this:
TRANSCRIPT_SERVER_URL=http://127.0.0.1:5000

# Optional metadata base
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 2) Transcript server (Flask)

```powershell
python -m venv .venv
\.\.venv\Scripts\Activate
python -m pip install --upgrade pip
pip install -r requirements.txt

# Required for the Flask service
$env:OPENAI_API_KEY = "your_openai_api_key"

# Recommended: port 5000 (matches frontend default)
python server.py -p 5000
```

Defaults (can also be set via env vars):

- PORT: `1000` if not provided (use `-p 5000` as shown)
- HOST: `0.0.0.0`
- FLASK_DEBUG: `true` in development

Health endpoints:

- `GET` `http://127.0.0.1:5000/health`
- `GET` `http://127.0.0.1:5000/`

Manual test:

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5000/transcribe" -ContentType "application/json" -Body (@{ youtube_url = "https://www.youtube.com/watch?v=KSaS9m8O2Rc" } | ConvertTo-Json)
```

### 3) Run Next.js

```powershell
pnpm dev
```

Open `http://localhost:3000` and paste a YouTube URL.

## Scripts

- dev: `next dev`
- build: `next build`
- start: `next start`

## Key files

- `app/page.tsx`: main UI, Markdown-ish renderer with highlights and image embedding
- `actions/summarize-shorts.ts`: server action to extract video ID, fetch transcript, summarize via OpenAI
- `app/components/ImageFromPrompt.tsx`: server component for AI image generation
- `app/components/ButtonExportPdf.tsx`: client component to export the rendered summary to PDF
- `server.py`: Flask transcript service using `yt-dlp` + OpenAI transcription, with JSON cache

## Environment variables

Frontend (`.env.local`):

- `OPENAI_API_KEY`: for summarization and image generation
- `TRANSCRIPT_SERVER_URL`: transcript server URL (default assumed: `http://127.0.0.1:5000`)
- `NEXT_PUBLIC_SITE_URL`: optional, used in metadata

Transcript server:

- `OPENAI_API_KEY`: for audio transcription
- `PORT`: port to bind (default `1000` unless overridden)
- `HOST`: host interface (default `0.0.0.0`)
- `FLASK_DEBUG`: `true`/`false`

## Export to PDF

After a summary is generated, click “Export PDF”. The exporter waits for images, sanitizes unsupported color spaces, rasterizes the current view, and slices into A4 pages.

## Troubleshooting

- Missing OpenAI key: UI will show errors or skip image generation. Ensure both Next.js and Flask have `OPENAI_API_KEY`.
- `ffmpeg` not found: install and ensure it’s on PATH; required by `yt-dlp`.
- Port mismatch: run Flask with `-p 5000` or update `TRANSCRIPT_SERVER_URL`.
- Slow first run: initial transcription may take time; results are cached in `cache/transcripts/`.

## License

MIT
