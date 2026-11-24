"""Prepare browser-compatible TOPIK audio and keep the original in the manifest."""

import argparse
from hashlib import file_digest
import json
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory


def probe(path):
    result = subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
         "stream=codec_name:format=duration", "-of", "json", str(path)],
        text=True,
    )
    metadata = json.loads(result)
    return metadata["streams"][0]["codec_name"], round(float(metadata["format"]["duration"]) * 1000)


def decode(path):
    return subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i", str(path),
         "-map", "0:a:0", "-f", "null", "-"],
        capture_output=True, text=True,
    )


def tag_length(packet, offset):
    if packet[offset:offset + 3] == b"TAG":
        return 128
    if packet[offset:offset + 3] != b"ID3":
        return 0
    header = packet[offset:offset + 10]
    if len(header) != 10 or header[3] not in (2, 3, 4) or max(header[6:]) >= 128:
        raise ValueError("Malformed embedded ID3 tag")
    body = 0
    for byte in header[6:]:
        body = (body << 7) | byte
    footer = 10 if header[3] == 4 and header[5] & 0x10 else 0
    return 10 + body + footer


def clean_mp3(source, destination):
    packets = subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
         "packet=size,pos", "-of", "csv=p=0", str(source)],
        text=True,
    )
    slices = []
    with source.open("rb") as handle:
        for row in packets.splitlines():
            values = row.strip().split(",")
            if len(values) != 2 or not all(value.isdecimal() for value in values):
                continue
            length, start = map(int, values)
            handle.seek(start)
            packet = handle.read(min(length, 1040))
            offset = 0
            while size := tag_length(packet, offset):
                offset += size
            if offset:
                if offset > length or (offset < length and packet[offset:offset + 1] != b"\xff"):
                    raise ValueError(f"Could not separate tags from MP3 audio at byte {start}")
                slices.append((start, start + offset))
        if not slices:
            raise ValueError("The MP3 decode failure was not caused by embedded ID3 tags")
        with destination.open("wb") as fixed:
            end = 0
            for start, next_byte in sorted(slices):
                if start < end:
                    raise ValueError("Overlapping embedded MP3 tags")
                handle.seek(end)
                fixed.write(handle.read(start - end))
                end = next_byte
            handle.seek(end)
            shutil.copyfileobj(handle, fixed)
    return len(slices)


def normalize(source, media):
    codec, original_ms = probe(source)
    if codec == "mp3" and decode(source).returncode == 0:
        return None

    with TemporaryDirectory(dir=media) as directory:
        stage = Path(directory)
        target = stage / "normalized.mp3"
        if codec == "mp3":
            input_file = stage / "without-embedded-tags.mp3"
            count = clean_mp3(source, input_file)
            codec_options = ["-c:a", "copy", "-write_xing", "1"]
            print(f"Removed embedded metadata at {count} MP3 packet boundaries", flush=True)
        else:
            input_file = source
            codec_options = ["-c:a", "libmp3lame", "-q:a", "4"]
        subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i", str(input_file),
             "-map", "0:a:0", "-map_metadata", "-1", *codec_options, str(target)],
            check=True,
        )
        result = decode(target)
        if result.returncode != 0:
            raise ValueError(result.stderr.strip())
        new_codec, duration = probe(target)
        if new_codec != "mp3" or abs(original_ms - duration) > 15000:
            raise ValueError("Unexpected codec or timing change after audio normalization")
        with target.open("rb") as handle:
            name = file_digest(handle, "sha256").hexdigest() + ".mp3"
        target.replace(media / name)
        return {"file": name, "durationMs": duration}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--round", type=int, action="append", dest="rounds")
    args = parser.parse_args()
    data = json.loads(args.manifest.read_text(encoding="utf-8"))
    media = args.manifest.parent / "media"

    for exam in data["exams"]:
        if args.rounds and exam["round"] not in args.rounds:
            continue
        audio = next(section["audio"] for section in exam["sections"] if section["kind"] == "LISTENING")
        normalized = normalize(media / audio["file"], media)
        if normalized:
            audio["normalized"] = normalized
            print(f"Prepared {exam['round']} TOPIK {exam['level']}", flush=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)


if __name__ == "__main__":
    main()
