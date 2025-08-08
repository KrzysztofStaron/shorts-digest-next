This is a Next.js project.

## Transcript HTTP server

This repo includes a small Flask-based transcript service in `serve.py` that the Next.js server-actions call.

Endpoints:

- `GET /health` — healthcheck
- `GET /` — metadata
- `GET /transcript?id=<videoId>&format=txt|json|srt|vtt&lang=en&lang=en-US&download=1` — fetch transcript in various formats
- `GET /transcript/available?id=<videoId>` — list available tracks for debugging

Environment variables:

- `PORT` (default: 8000)
- `FLASK_DEBUG` ("true" to enable debug)
- `CORS_ALLOW_ORIGINS` (default: `*`)
- `RATE_LIMIT_PER_MINUTE` (default: 60)
- `CACHE_MAX_AGE_SECONDS` (default: 600)
- `TRANSCRIPT_SERVER_URL` (Next.js side; default: `http://127.0.0.1:8000`)
- Optional proxy (helps avoid IP bans):
  - `YTA_WEBSHARE_USERNAME`, `YTA_WEBSHARE_PASSWORD`, `YTA_PROXY_COUNTRIES`
  - or `YTA_HTTP_PROXY`, `YTA_HTTPS_PROXY` (falls back to `HTTP_PROXY`/`HTTPS_PROXY`)

Install and run on Windows (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate
python -m pip install --upgrade pip
pip install -r requirements.txt

$env:PORT = 8000
python serve.py
```

In Next.js, set `TRANSCRIPT_SERVER_URL` in `.env.local` if you change the port.
