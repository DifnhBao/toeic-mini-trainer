"""Offline CPU transcription. Only the explicitly downloaded local model is used."""
import argparse
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["DO_NOT_TRACK"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"


def digest(file):
    checksum = hashlib.sha256()
    with file.open("rb") as stream:
        while data := stream.read(1024 * 1024):
            checksum.update(data)
    return checksum.hexdigest()


def write_json(destination, value):
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model", type=Path, default=Path(__file__).resolve().parents[1] / "Test/ai-audio/models/base.en")
    parser.add_argument("--seconds", type=float, default=None, help="Pilot duration; omit for full audio")
    parser.add_argument("--repair-proposals", type=Path, help="Retry only windows with missing announcements, using the same offline model")
    parser.add_argument("--tight-repair", action="store_true", help="For a remaining Part 1/2 cue, retry a short central window; only spoken cues are accepted")
    parser.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()
    source, model = args.source.resolve(strict=True), args.model.resolve(strict=True)
    if not source.is_file() or source.stat().st_size > 100 * 1024 * 1024:
        raise ValueError("Choose a local audio file <=100 MiB")
    if not 1 <= args.threads <= 4:
        raise ValueError("Use 1-4 CPU threads")
    probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=duration", "-of", "json", str(source)]))
    duration = float(probe["format"]["duration"])
    if not 0 < duration <= 7200 or (args.seconds is not None and not 0 < args.seconds <= duration):
        raise ValueError("Audio <=2 hours; pilot duration must be within the file")
    limit = min(duration, args.seconds or duration)
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    model_manifest = json.loads((model / "download-manifest.json").read_text(encoding="utf-8"))
    for entry in model_manifest["files"]:
        name = entry["file"]
        if name not in ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt") or digest(model / name) != entry["sha256"]:
            raise ValueError("Local model checksum mismatch")
    config = {"modelRepository": model_manifest["repository"], "modelRevision": model_manifest["revision"], "computeType": "int8", "beamSize": 3, "wordTimestamps": True, "chunkSeconds": 120, "overlapSeconds": 8}
    result = {"version": 1, "sourceFile": source.name, "sourceSha256": digest(source), "duration": duration, "config": config, "chunks": []}
    if output.exists():
        saved = json.loads(output.read_text(encoding="utf-8"))
        if saved["sourceSha256"] != result["sourceSha256"] or saved["config"] != config:
            raise ValueError("Existing transcript belongs to another source/model configuration")
        result = saved
    import numpy as np
    from faster_whisper import WhisperModel
    print("Loading offline English base model on CPU INT8 (no API calls)", flush=True)
    recognizer = WhisperModel(str(model), device="cpu", compute_type="int8", cpu_threads=args.threads, num_workers=1, local_files_only=True)
    started = time.monotonic()
    windows = [(offset, min(offset + 128, limit)) for offset in range(0, int(limit + 0.999), 120)]
    if args.repair_proposals:
        proposals = json.loads(args.repair_proposals.read_text(encoding="utf-8"))
        if proposals["sourceSha256"] != result["sourceSha256"] or proposals["duration"] != duration:
            raise ValueError("Repair proposals belong to another audio")
        windows = []
        for missing in proposals["unresolved"]:
            if "Chưa nhận dạng" not in missing["reason"]:
                continue
            before = [cue for cue in proposals["cues"] if cue["first"] < missing["first"]]
            after = [cue for cue in proposals["cues"] if cue["first"] > missing["first"]]
            start = max(0, max(before, key=lambda cue: cue["first"])["start"] - 1) if before else 0
            end = min(duration, min(after, key=lambda cue: cue["first"])["start"] + 3) if after else duration
            if args.tight_repair and missing["first"] <= 31 and end - start <= 60:
                middle = (start + end) / 2
                start, end = max(0, middle - 10), min(duration, middle + 10)
            if 0 < end - start <= 300:
                windows.append((start, end))
        print(f"Retrying {len(windows)} short windows; no guessed boundaries are accepted", flush=True)
    for offset, end in windows:
        if any(chunk["start"] == offset and chunk["end"] == end for chunk in result["chunks"]):
            print(f"Reusing {offset:.0f}-{end:.0f}s", flush=True)
            continue
        raw = subprocess.check_output(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-ss", str(offset),
            "-protocol_whitelist", "file,pipe", "-i", str(source), "-t", str(end - offset), "-map", "0:a:0", "-vn", "-ar", "16000", "-ac", "1", "-f", "f32le", "pipe:1"], timeout=60)
        samples = np.frombuffer(raw, dtype=np.float32).copy()
        speech, _ = recognizer.transcribe(samples, language="en", beam_size=3, temperature=0,
            word_timestamps=True, condition_on_previous_text=False, vad_filter=False)
        utterances = []
        for segment in speech:
            utterances.append({"start": offset + segment.start, "end": offset + segment.end, "text": segment.text,
                "avgLogprob": segment.avg_logprob, "noSpeechProb": segment.no_speech_prob,
                "words": [{"start": offset + word.start, "end": offset + word.end, "text": word.word, "probability": word.probability} for word in segment.words or []]})
        result["chunks"] = [chunk for chunk in result["chunks"] if chunk["start"] != offset] + [{"start": offset, "end": end, "segments": utterances}]
        result["processedThrough"] = max(chunk["end"] for chunk in result["chunks"])
        result["complete"] = result["processedThrough"] >= duration
        write_json(output, result)
        print(f"Transcribed {offset:.0f}-{end:.0f}s / {limit:.0f}s; {len(utterances)} utterances; elapsed {time.monotonic() - started:.1f}s", flush=True)
    print(f"Saved offline transcript: {output}", flush=True)


if __name__ == "__main__":
    main()
