import os
import subprocess
import sys
import tempfile
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
import openai

app = Flask(__name__)

MODEL = "gpt-4o-mini-transcribe" # don't change this

# Configure OpenAI
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("OPENAI_API_KEY is not set in environment.", file=sys.stderr)
    sys.exit(1)

client = openai.OpenAI(api_key=api_key)

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    try:
        # Check if the request contains a YouTube URL
        if 'youtube_url' in request.json:
            youtube_url = request.json['youtube_url']
            
            # Download YouTube audio
            with tempfile.TemporaryDirectory() as temp_dir:
                audio_path = os.path.join(temp_dir, "audio.mp3")
                subprocess.run([
                    "yt-dlp", "-x", "--audio-format", "mp3", 
                    "-o", audio_path, youtube_url
                ], check=True)
                
                # Transcribe the audio
                with open(audio_path, "rb") as audio_file:
                    transcript = openai.Audio.transcribe(
                        model=MODEL,
                        file=audio_file
                    )
                
                return jsonify({
                    "success": True,
                    "transcript": transcript["text"],
                    "source": "youtube",
                    "url": youtube_url
                })
        
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
                
                # Transcribe the audio
                with open(temp_file.name, "rb") as f:
                    transcript = openai.Audio.transcribe(
                        model=MODEL,
                        file=f
                    )
                
                # Clean up the temporary file
                os.unlink(temp_file.name)
                
                return jsonify({
                    "success": True,
                    "transcript": transcript["text"],
                    "source": "file_upload",
                    "filename": filename
                })
        
        else:
            return jsonify({
                "success": False,
                "error": "Please provide either a 'youtube_url' in JSON or upload an 'audio' file"
            }), 400
            
    except subprocess.CalledProcessError as e:
        return jsonify({
            "success": False,
            "error": f"Error downloading YouTube video: {str(e)}"
        }), 500
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Error processing audio: {str(e)}"
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
        
        # Transcribe the local audio file
        with open(audio_path, "rb") as audio_file:
            transcript = openai.Audio.transcribe(
                model=MODEL,
                file=audio_file
            )
        
        return jsonify({
            "success": True,
            "transcript": transcript["text"],
            "source": "local_file",
            "filename": "audio.mp3"
        })
        
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

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
