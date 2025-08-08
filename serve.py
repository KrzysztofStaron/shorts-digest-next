# app.py
from __future__ import annotations

import hashlib
import logging
import os
import time
import uuid
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse, parse_qs

from flask import Flask, request, jsonify, Response, make_response, g
from youtube_transcript_api import YouTubeTranscriptApi
try:
    from youtube_transcript_api.proxies import WebshareProxyConfig, GenericProxyConfig
except Exception:  # pragma: no cover - optional import if proxies submodule not present
    WebshareProxyConfig = None  # type: ignore
    GenericProxyConfig = None  # type: ignore

try:
    # CORS is important for browser access from Next.js
    from flask_cors import CORS
except Exception:  # pragma: no cover - optional import
    CORS = None  # type: ignore

app = Flask(__name__)

# ---- Configuration ----
RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))
CACHE_MAX_AGE_SECONDS = int(os.getenv("CACHE_MAX_AGE_SECONDS", "600"))
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("CORS_ALLOW_ORIGINS", "*").split(",") if o.strip()]

# Enable CORS if dependency is present
if CORS is not None:
    CORS(app, resources={r"/*": {"origins": ALLOWED_ORIGINS}})

# Logging
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("transcript-server")

# Simple in-memory rate limiter storage (per-process)
_rate_buckets: Dict[str, List[float]] = {}


def _get_client_ip() -> str:
    # Honor common proxy headers if present
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


@app.before_request
def _before_request() -> None:
    # attach a correlation id to every request
    g.request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())

    # basic rate limit per IP
    if RATE_LIMIT_PER_MINUTE > 0:
        now = time.time()
        window_start = now - 60.0
        ip = _get_client_ip()
        bucket = _rate_buckets.setdefault(ip, [])
        # prune
        while bucket and bucket[0] < window_start:
            bucket.pop(0)
        if len(bucket) >= RATE_LIMIT_PER_MINUTE:
            logger.warning("rate_limited ip=%s", ip)
            return jsonify(error="Too many requests"), 429
        bucket.append(now)


@app.after_request
def _after_request(response: Response) -> Response:
    # propagate request id
    if hasattr(g, "request_id"):
        response.headers["X-Request-Id"] = str(g.request_id)
    # basic security headers
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response


def extract_video_id(url_or_id: str) -> Optional[str]:
    if not url_or_id:
        return None
    # Already looks like an ID (no scheme and shortish)
    if "://" not in url_or_id and "/" not in url_or_id and len(url_or_id) >= 8:
        return url_or_id

    try:
        u = urlparse(url_or_id)
        host = (u.hostname or "").lower()

        if "youtu.be" in host:
            return u.path.lstrip("/") or None

        if "youtube.com" in host:
            if u.path.startswith("/watch"):
                return parse_qs(u.query).get("v", [None])[0]
            if u.path.startswith("/shorts/"):
                parts = u.path.split("/")
                return parts[2] if len(parts) >= 3 else None

        return None
    except Exception:
        return None


def seconds_to_srt_time(seconds: float) -> str:
    ms = int(round((seconds - int(seconds)) * 1000))
    total_seconds = int(seconds)
    h = total_seconds // 3600
    m = (total_seconds % 3600) // 60
    s = total_seconds % 60
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def seconds_to_vtt_time(seconds: float) -> str:
    ms = int(round((seconds - int(seconds)) * 1000))
    total_seconds = int(seconds)
    h = total_seconds // 3600
    m = (total_seconds % 3600) // 60
    s = total_seconds % 60
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def format_as_txt(snippets: List[Dict[str, Any]]) -> str:
    # plain text joined by newline
    return "\n".join(s["text"] for s in snippets if s.get("text"))


def format_as_srt(snippets: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for i, s in enumerate(snippets, start=1):
        start = float(s["start"])
        end = start + float(s.get("duration", 0.0))
        lines.append(str(i))
        lines.append(f"{seconds_to_srt_time(start)} --> {seconds_to_srt_time(end)}")
        lines.append(s.get("text", ""))
        lines.append("")  # blank line between cues
    return "\n".join(lines)


def format_as_vtt(snippets: List[Dict[str, Any]]) -> str:
    lines: List[str] = ["WEBVTT", ""]
    for s in snippets:
        start = float(s["start"])
        end = start + float(s.get("duration", 0.0))
        lines.append(f"{seconds_to_vtt_time(start)} --> {seconds_to_vtt_time(end)}")
        lines.append(s.get("text", ""))
        lines.append("")  # blank line
    return "\n".join(lines)


def get_languages_from_request() -> List[str]:
    # Accept: ?lang=en&lang=de or ?languages=en,de
    langs_multi = request.args.getlist("lang")
    langs_csv = request.args.get("languages")
    langs: List[str] = []

    if langs_multi:
        langs.extend([l.strip() for l in langs_multi if l.strip()])

    if langs_csv:
        langs.extend([l.strip() for l in langs_csv.split(",") if l.strip()])

    # Default preference
    return langs or ["en", "en-US", "en-GB"]


def fetch_transcript(video_id: str, languages: List[str]) -> List[Dict[str, Any]]:
    """
    Try multiple strategies, matching the APIs presented in docs.txt,
    but also supporting widely used method names in the package.
    """
    # Prepare optional proxy configuration
    proxy_config = None
    try:
        webshare_user = os.getenv("YTA_WEBSHARE_USERNAME")
        webshare_pass = os.getenv("YTA_WEBSHARE_PASSWORD")
        proxy_http = os.getenv("YTA_HTTP_PROXY") or os.getenv("HTTP_PROXY")
        proxy_https = os.getenv("YTA_HTTPS_PROXY") or os.getenv("HTTPS_PROXY")

        if webshare_user and webshare_pass and WebshareProxyConfig is not None:
            proxy_config = WebshareProxyConfig(
                proxy_username=webshare_user,
                proxy_password=webshare_pass,
                filter_ip_locations=[x.strip() for x in os.getenv("YTA_PROXY_COUNTRIES", "").split(",") if x.strip()],
            )
        elif (proxy_http or proxy_https) and GenericProxyConfig is not None:
            proxy_config = GenericProxyConfig(
                http_url=proxy_http,
                https_url=proxy_https,
            )
    except Exception:
        proxy_config = None

    # 1) Try direct transcript in preferred languages
    try:
        # Newer/alt style (docs.txt-esque)
        api = YouTubeTranscriptApi(proxy_config=proxy_config) if proxy_config else YouTubeTranscriptApi()
        try:
            return api.fetch(video_id)  # type: ignore[attr-defined]
        except Exception:
            pass

        # Standard style
        return YouTubeTranscriptApi.get_transcript(video_id, languages=languages)
    except Exception:
        pass

    # 2) List available tracks and pick best match
    transcript_list = None
    try:
        api = YouTubeTranscriptApi(proxy_config=proxy_config) if proxy_config else YouTubeTranscriptApi()
        try:
            transcript_list = api.list(video_id)  # type: ignore[attr-defined]
        except Exception:
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
    except Exception:
        transcript_list = None

    if transcript_list is not None:
        # Try requested langs first
        try:
            t = transcript_list.find_transcript(languages)
            return t.fetch()
        except Exception:
            pass

        # Try manually created over generated
        try:
            t = transcript_list.find_manually_created_transcript(languages)
            return t.fetch()
        except Exception:
            pass

        try:
            t = transcript_list.find_generated_transcript(languages)
            return t.fetch()
        except Exception:
            pass

        # As a last resort: take the first available
        try:
            for t in transcript_list:
                try:
                    return t.fetch()
                except Exception:
                    continue
        except Exception:
            pass

        # 2.5) If still nothing matched, try translating any available transcript
        # to the first preferred language (or 'en' by default)
        try:
            preferred = languages[0] if languages else "en"
            for t in transcript_list:
                try:
                    # Only attempt translate if supported
                    if getattr(t, "is_translatable", False):
                        translated = t.translate(preferred)
                        return translated.fetch()
                except Exception:
                    continue
        except Exception:
            pass

    # 3) Nothing worked
    raise RuntimeError("No transcript available for the requested video.")


def _build_etag(body: str) -> str:
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
    # use a strong ETag
    return f'"{digest}"'


def _respond_with_text(body: str, content_type: str, filename: str, as_attachment: bool) -> Response:
    etag = _build_etag(body)
    if_match = request.headers.get("If-None-Match")
    if if_match and if_match == etag:
        resp = make_response("", 304)
        resp.headers["ETag"] = etag
        return resp

    resp = make_response(body)
    resp.headers["Content-Type"] = f"{content_type}; charset=utf-8"
    disposition_type = "attachment" if as_attachment else "inline"
    resp.headers["Content-Disposition"] = f'{disposition_type}; filename="{filename}"'
    resp.headers["ETag"] = etag
    if CACHE_MAX_AGE_SECONDS > 0:
        resp.headers["Cache-Control"] = f"public, max-age={CACHE_MAX_AGE_SECONDS}"
    return resp


@app.get("/health")
def health() -> Response:
    return jsonify(status="ok")


@app.get("/")
def root() -> Response:
    return jsonify(
        name="transcript-server",
        status="ok",
        endpoints=["/transcript", "/transcript/available", "/health"],
    )


@app.get("/transcript")
def get_transcript_route() -> Response:
    """
    Query params:
      - url or id (required)
      - lang=... (repeatable) or languages=en,de (csv)
      - format=txt|json|srt|vtt (default=txt)
    """
    url_or_id = request.args.get("url") or request.args.get("id")
    if not url_or_id:
        return jsonify(error="Missing 'url' or 'id'"), 400

    video_id = extract_video_id(url_or_id)
    if not video_id:
        return jsonify(error="Invalid YouTube URL or ID"), 400

    languages = get_languages_from_request()
    fmt = (request.args.get("format") or "txt").lower()
    download_param = (request.args.get("download") or "").lower()
    as_attachment = download_param in ("1", "true", "yes")

    try:
        snippets = fetch_transcript(video_id, languages)
    except Exception as e:
        return jsonify(error=str(e)), 404

    if fmt == "json":
        return jsonify({
            "videoId": video_id,
            "languagesTried": languages,
            "snippets": snippets,
        })

    filename = f"{video_id}.{fmt}"

    if fmt == "srt":
        body = format_as_srt(snippets)
        return _respond_with_text(body, "text/plain", filename, as_attachment)

    if fmt == "vtt":
        body = format_as_vtt(snippets)
        return _respond_with_text(body, "text/vtt", filename, as_attachment)

    # default txt
    body = format_as_txt(snippets)
    return _respond_with_text(body, "text/plain", filename, as_attachment)


@app.get("/transcript/available")
def list_available_transcripts() -> Response:
    """
    Debug endpoint: returns what transcripts YouTube exposes for this video.
    Query params:
      - url or id (required)
    """
    url_or_id = request.args.get("url") or request.args.get("id")
    if not url_or_id:
        return jsonify(error="Missing 'url' or 'id'"), 400

    video_id = extract_video_id(url_or_id)
    if not video_id:
        return jsonify(error="Invalid YouTube URL or ID"), 400

    try:
        api = YouTubeTranscriptApi()
        try:
            transcript_list = api.list(video_id)  # type: ignore[attr-defined]
        except Exception:
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        available = []
        for t in transcript_list:
            available.append({
                "language": getattr(t, "language", None),
                "languageCode": getattr(t, "language_code", None),
                "isGenerated": getattr(t, "is_generated", None),
                "isTranslatable": getattr(t, "is_translatable", None),
                "translationLanguages": [
                    getattr(x, "language_code", x.get("language_code")) if isinstance(x, dict) else getattr(x, "language_code", None)
                    for x in (getattr(t, "translation_languages", []) or [])
                ],
            })

        return jsonify({
            "videoId": video_id,
            "available": available,
        })
    except Exception as e:
        return jsonify(error=str(e)), 404

if __name__ == "__main__":
    # For local dev only; use a WSGI/ASGI server in production
    port = int(os.getenv("PORT", "8000"))
    debug = os.getenv("FLASK_DEBUG", "false").lower() in ("1", "true", "yes")
    app.run(host="0.0.0.0", port=port, debug=debug)