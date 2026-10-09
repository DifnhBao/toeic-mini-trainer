"""Download public model weights only; never reads/uploads a user's audio."""
import argparse
import hashlib
import json
import urllib.request
from pathlib import Path

REPOSITORY = "Systran/faster-whisper-base.en"
REVISION = "3d3d5dee26484f91867d81cb899cfcf72b96be6c"
FILES = ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt")
EXPECTED = {
    "config.json": "f3bc3821e9fc76a27bae538e11ae5b677dcdd352b4600429ce7951d398569aeb",
    "model.bin": "2a166925539a16005f14ff328359f9b9adb9dc4fb631bb3b227526862e93e2ef",
    "tokenizer.json": "929c5252409436dce1b38a75d1abbcb5e132d170d8e324e4e04ed915fa2d22df",
    "vocabulary.txt": "ff77588746d3a2595d32ab5b69ffd7b95ce2441ac57533cb66fc3eb575a115cf",
}
LIMIT = 160 * 1024 * 1024


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parents[1] / "Test/ai-audio/models/base.en")
    directory = parser.parse_args().directory.resolve()
    if not directory.is_relative_to(Path(__file__).resolve().parents[1] / "Test/ai-audio/models"):
        raise ValueError("Keep downloaded models inside Test/ai-audio/models")
    directory.mkdir(parents=True, exist_ok=True)
    manifest = []
    for name in FILES:
        destination = directory / name
        if destination.exists():
            checksum = hashlib.sha256()
            with destination.open("rb") as stream:
                while data := stream.read(1024 * 1024):
                    checksum.update(data)
            if checksum.hexdigest() != EXPECTED[name]:
                raise RuntimeError(f"Existing model file checksum mismatch: {destination}")
            manifest.append({"file": name, "bytes": destination.stat().st_size, "sha256": checksum.hexdigest()})
            print(f"Reusing verified {name}", flush=True)
            continue
        temporary = directory / (name + ".download")
        checksum, size = hashlib.sha256(), 0
        try:
            url = f"https://huggingface.co/{REPOSITORY}/resolve/{REVISION}/{name}?download=true"
            with urllib.request.urlopen(url, timeout=60) as response, temporary.open("xb") as output:
                while data := response.read(1024 * 1024):
                    size += len(data)
                    if size > LIMIT:
                        raise RuntimeError("Model download exceeds size limit")
                    output.write(data)
                    checksum.update(data)
            if checksum.hexdigest() != EXPECTED[name]:
                raise RuntimeError(f"Downloaded model checksum mismatch: {name}")
            temporary.rename(destination)
            manifest.append({"file": name, "bytes": size, "sha256": checksum.hexdigest()})
            print(f"Downloaded {name}: {size} bytes", flush=True)
        finally:
            temporary.unlink(missing_ok=True)
    (directory / "download-manifest.json").write_text(json.dumps({"repository": REPOSITORY, "revision": REVISION, "files": manifest}, indent=2), encoding="utf-8")
    print(f"Local model ready: {directory}", flush=True)


if __name__ == "__main__":
    main()
