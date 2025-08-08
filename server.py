import os
import subprocess
import sys
import tempfile
import json
import hashlib
import argparse
from datetime import datetime
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
from flask_cors import CORS
from openai import OpenAI

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

MODEL = "gpt-4o-mini-transcribe"

# Caching configuration
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache", "transcripts")

def ensure_cache_dir() -> None:
    os.makedirs(CACHE_DIR, exist_ok=True)

def get_cache_path(cache_key: str) -> str:
    ensure_cache_dir()
    return os.path.join(CACHE_DIR, f"{cache_key}.json")

def read_cache(cache_key: str):
    try:
        cache_path = get_cache_path(cache_key)
        if os.path.exists(cache_path):
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                # Mark as cached on read
                data["cached"] = True
                return data
    except Exception as e:
        # Non-fatal cache read failure
        print(f"[cache] read failed for key={cache_key}: {e}")
    return None

def write_cache(cache_key: str, payload: dict) -> None:
    try:
        cache_path = get_cache_path(cache_key)
        temp_path = cache_path + ".tmp"
        # Do not force cached=true on write; runtime will add it on read
        to_store = dict(payload)
        to_store["cached"] = False
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(to_store, f, ensure_ascii=False)
        os.replace(temp_path, cache_path)
    except Exception as e:
        # Non-fatal cache write failure
        print(f"[cache] write failed for key={cache_key}: {e}")

def build_youtube_cache_key(youtube_url: str) -> str:
    return hashlib.sha256(f"youtube|{MODEL}|{youtube_url}".encode("utf-8")).hexdigest()

def build_file_cache_key(file_path: str) -> str:
    sha = hashlib.sha256()
    sha.update(f"file|{MODEL}|".encode("utf-8"))
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()

# Configure OpenAI
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("OPENAI_API_KEY is not set in environment.", file=sys.stderr)
    sys.exit(1)

client = OpenAI(api_key=api_key)

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    try:
        # Check if request has JSON data
        if not request.is_json:
            return jsonify({
                "success": False,
                "error": "Request must be JSON"
            }), 400
        
        json_data = request.get_json()
        if not json_data:
            return jsonify({
                "success": False,
                "error": "No JSON data provided"
            }), 400
        
        # Check if the request contains a YouTube URL
        if 'youtube_url' in json_data:
            youtube_url = json_data['youtube_url']
            # Cache lookup by URL
            url_cache_key = build_youtube_cache_key(youtube_url)
            cached = read_cache(url_cache_key)
            if cached:
                return jsonify(cached)
            
            # Download YouTube audio
            print(f"Downloading audio from: {youtube_url}")
            with tempfile.TemporaryDirectory() as temp_dir:
                audio_path = os.path.join(temp_dir, "audio.mp3")
                result = subprocess.run([
                    "yt-dlp", "-x", "--audio-format", "mp3", 
                    "--audio-quality", "9",  # Lowest quality (0=best, 9=worst)
                    "-f", "worstaudio",  # Select worst quality audio stream
                    "-o", audio_path, youtube_url
                ], check=True, capture_output=True, text=True)
                print(f"yt-dlp completed successfully")
                
                # Transcribe the audio
                with open(audio_path, "rb") as audio_file:
                    transcript = client.audio.transcriptions.create(
                        model=MODEL,
                        file=audio_file
                    )
                
                response_data = {
                    "success": True,
                    "transcript": transcript.text,
                    "source": "youtube",
                    "url": youtube_url,
                    "model": MODEL,
                    "cached": False,
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                }
                write_cache(url_cache_key, response_data)
                return jsonify(response_data)
        
        # Check if the request contains an audio file
        elif 'audio' in request.files:
            audio_file = request.files['audio']
            
            if audio_file.filename == '':
                return jsonify({
                    "success": False,
                    "error": "No file selected"
                }), 400
            
            # Save the uploaded file temporarily
            filename = secure_filename(audio_file.filename)
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as temp_file:
                audio_file.save(temp_file.name)
                
                # Cache lookup by file content hash
                file_cache_key = build_file_cache_key(temp_file.name)
                cached = read_cache(file_cache_key)
                if cached:
                    # Clean up temp file before returning
                    try:
                        os.unlink(temp_file.name)
                    except Exception:
                        pass
                    return jsonify(cached)
                
                # Transcribe the audio
                with open(temp_file.name, "rb") as f:
                    transcript = client.audio.transcriptions.create(
                        model=MODEL,
                        file=f
                    )
                
                # Clean up the temporary file
                os.unlink(temp_file.name)
                
                response_data = {
                    "success": True,
                    "transcript": transcript.text,
                    "source": "file_upload",
                    "filename": filename,
                    "model": MODEL,
                    "cached": False,
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                }
                write_cache(file_cache_key, response_data)
                return jsonify(response_data)
        
        else:
            return jsonify({
                "success": False,
                "error": "Please provide either a 'youtube_url' in JSON or upload an 'audio' file"
            }), 400
            
    except subprocess.CalledProcessError as e:
        error_msg = f"Error downloading YouTube video: {str(e)}"
        if hasattr(e, 'stderr') and e.stderr:
            error_msg += f" - stderr: {e.stderr}"
        if hasattr(e, 'stdout') and e.stdout:
            error_msg += f" - stdout: {e.stdout}"
        print(error_msg)
        return jsonify({
            "success": False,
            "error": error_msg
        }), 500
    except Exception as e:
        error_msg = f"Error processing audio: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": error_msg
        }), 500

@app.route('/transcribe-local', methods=['POST'])
def transcribe_local_audio():
    """Transcribe the local audio.mp3 file"""
    try:
        audio_path = "audio.mp3"
        
        if not os.path.exists(audio_path):
            return jsonify({
                "success": False,
                "error": "audio.mp3 file not found"
            }), 404
        
        # Cache lookup by local file content hash
        file_cache_key = build_file_cache_key(audio_path)
        cached = read_cache(file_cache_key)
        if cached:
            return jsonify(cached)
        
        # Transcribe the local audio file
        with open(audio_path, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                model=MODEL,
                file=audio_file
            )
        
        response_data = {
            "success": True,
            "transcript": transcript.text,
            "source": "local_file",
            "filename": "audio.mp3",
            "model": MODEL,
            "cached": False,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        write_cache(file_cache_key, response_data)
        return jsonify(response_data)
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Error transcribing local audio: {str(e)}"
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "transcript-server"
    })

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        "message": "Transcript Server",
        "endpoints": {
            "/transcribe": "POST - Transcribe audio from YouTube URL or uploaded file",
            "/transcribe-local": "POST - Transcribe local audio.mp3 file", 
            "/health": "GET - Health check"
        }
    })

def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_args():
    parser = argparse.ArgumentParser(description="Transcript Server")
    parser.add_argument("-p", "--port", type=int, default=None, help="Port to bind (overrides PORT env var)")
    parser.add_argument("--host", type=str, default=None, help="Host interface to bind (overrides HOST env var)")
    parser.add_argument("--no-debug", action="store_true", help="Disable Flask debug mode (or set FLASK_DEBUG=false)")
    return parser.parse_args()


if __name__ == '__main__':
    args = _parse_args()

    default_port = int(os.getenv("PORT", "1000"))
    default_host = os.getenv("HOST", "0.0.0.0")
    debug_env = _env_bool("FLASK_DEBUG", True)

    port = args.port if args.port is not None else default_port
    host = args.host if args.host is not None else default_host
    debug = False if args.no_debug else debug_env

    print(f"[server] Starting on http://{host}:{port} (debug={'on' if debug else 'off'})")
    app.run(debug=debug, host=host, port=port)
