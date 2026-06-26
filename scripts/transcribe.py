#!/usr/bin/env python3
"""
Whisper Transcription Script
-----------------------------
Called from Node.js to transcribe audio/video files using OpenAI's
open-source Whisper model running locally (100% free, no API key).

Usage:
    python3 scripts/transcribe.py <audio_file_path> [--model base] [--language en]

Output (JSON to stdout):
    {
        "text": "Full transcript text...",
        "segments": [
            { "start": 0.0, "end": 4.5, "text": "Hello world" },
            ...
        ],
        "language": "en",
        "duration": 120.5
    }

Models (downloaded automatically on first use):
    tiny   (~39 MB)  — fastest, least accurate
    base   (~74 MB)  — good balance for learning projects ← DEFAULT
    small  (~244 MB) — better accuracy
    medium (~769 MB) — high accuracy
    large  (~1550 MB) — best accuracy, slowest
"""

import sys
import json
import argparse
import os
import warnings

# Suppress FP16 warning on CPU and other noisy warnings
warnings.filterwarnings("ignore", message="FP16 is not supported on CPU")
warnings.filterwarnings("ignore", category=UserWarning)


def transcribe(audio_path, model_name="base", language=None):
    """
    Transcribe an audio file using the local Whisper model.

    Args:
        audio_path: Path to the audio/video file
        model_name: Whisper model size (tiny, base, small, medium, large)
        language: Language code (e.g., 'en'). None = auto-detect.

    Returns:
        dict with text, segments, language, and duration
    """
    import whisper

    # Load the model (downloads automatically on first run)
    # Models are cached at ~/.cache/whisper/
    model = whisper.load_model(model_name)

    # Transcribe with verbose_json-style output
    transcribe_options = {
        "verbose": False,        # don't print to console
        "word_timestamps": False, # segment-level is sufficient
    }

    if language:
        transcribe_options["language"] = language

    result = model.transcribe(audio_path, **transcribe_options)

    # Build the output
    segments = []
    for segment in result.get("segments", []):
        segments.append({
            "start": round(segment["start"], 2),
            "end": round(segment["end"], 2),
            "text": segment["text"].strip(),
        })

    # Calculate total duration from the last segment
    duration = segments[-1]["end"] if segments else 0

    return {
        "text": result.get("text", "").strip(),
        "segments": segments,
        "language": result.get("language", "unknown"),
        "duration": round(duration, 2),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Transcribe audio/video using local Whisper model"
    )
    parser.add_argument(
        "audio_path",
        help="Path to the audio or video file to transcribe"
    )
    parser.add_argument(
        "--model",
        default="base",
        choices=["tiny", "base", "small", "medium", "large"],
        help="Whisper model size (default: base)"
    )
    parser.add_argument(
        "--language",
        default=None,
        help="Language code (e.g., 'en'). Omit for auto-detection."
    )

    args = parser.parse_args()

    # Validate file exists
    if not os.path.exists(args.audio_path):
        print(json.dumps({
            "error": f"File not found: {args.audio_path}"
        }), file=sys.stderr)
        sys.exit(1)

    try:
        result = transcribe(args.audio_path, args.model, args.language)
        # Output clean JSON to stdout (Node.js will parse this)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "error": str(e)
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
