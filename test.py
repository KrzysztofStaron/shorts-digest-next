import os
import subprocess
import sys
import openai

# 1. Download YouTube audio
video_url = "https://www.youtube.com/watch?v=9V2rxSF6REI"
subprocess.run([
    "yt-dlp", "-x", "--audio-format", "mp3", 
    "-o", "audio.%(ext)s", video_url
])

# 2. Send audio to Whisper API
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("OPENAI_API_KEY is not set in environment.", file=sys.stderr)
    sys.exit(1)

openai.api_key = api_key
with open("audio.mp3", "rb") as audio_file:
    transcript = openai.Audio.transcribe(
        model="gpt-4o-mini-transcribe",  # or "whisper-1"
        file=audio_file
    )

print(transcript.text)
