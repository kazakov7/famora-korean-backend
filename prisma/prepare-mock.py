"""Prepare a TOPIK II Mock dataset from the pinned question banks."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
import json
import math
from pathlib import Path, PurePosixPath
import re
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from PIL import Image

SOURCES = {
    "reading": "3c7bf35d696f66f1217b9f28c1d2c0717aa9a62f",
    "listening": "7299a4f2fd60bd34bda3dc7c03dca7a134005b0c",
}
# Each row pairs reading and listening, then selects an official writing round.
ROUNDS = [
    (100, 100, 102), (103, 103, 83), (99, 99, 64), (97, 97, 60),
    (94, 94, 52), (93, 93, 47), (89, 90, 41), (87, 89, 37),
    (81, 91, 91), (78, 96, 96),
]


def source_url(kind, path):
    return (
        f"https://raw.githubusercontent.com/jisdcm29-sketch/topik2-{kind}-ibt/"
        f"{SOURCES[kind]}/{kind}-test/{path}"
    )


def fetch(root, kind, path):
    relative = path.removeprefix("./")
    if not re.fullmatch(r"[A-Za-z0-9_./-]+", relative) or any(
        part in ("", ".", "..") for part in relative.split("/")
    ):
        raise ValueError(f"Invalid source path: {path}")
    file = root / "raw" / kind / relative
    if file.is_file():
        return file
    file.parent.mkdir(parents=True, exist_ok=True)
    request = Request(source_url(kind, relative), headers={"User-Agent": "quiz-mock-import"})
    for attempt in range(4):
        try:
            with urlopen(request, timeout=30) as response:
                if response.geturl() != request.full_url:
                    raise ValueError(f"Unexpected redirect for {relative}")
                data = response.read()
            if not data:
                raise ValueError(f"Empty source file: {path}")
            temporary = file.with_suffix(file.suffix + ".tmp")
            temporary.write_bytes(data)
            temporary.replace(file)
            return file
        except (URLError, TimeoutError) as error:
            if attempt == 3 or isinstance(error, HTTPError) and error.code == 404:
                raise
            time.sleep(attempt + 1)


def prepare_media(root, reference):
    kind, path = reference
    raw = fetch(root, kind, path)
    extension = PurePosixPath(path).suffix.lower()
    data = raw.read_bytes()
    if extension == ".mp3":
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a:0",
             "-show_entries", "stream=codec_name:format=duration", "-of", "json", str(raw)],
            check=True, capture_output=True, text=True,
        )
        info = json.loads(probe.stdout)
        if [stream["codec_name"] for stream in info["streams"]] != ["mp3"]:
            raise ValueError(f"Invalid MP3 stream: {path}")
        duration = math.floor(float(info["format"]["duration"]) * 1000)
        if duration <= 0:
            raise ValueError(f"Invalid audio duration: {path}")
        name = sha256(data).hexdigest() + ".mp3"
        target = root / "media" / name
        try:
            target.hardlink_to(raw)
        except FileExistsError:
            pass
        return reference, {"file": name, "durationMs": duration}

    with Image.open(BytesIO(data)) as image:
        buffer = BytesIO()
        image.save(buffer, "WEBP", lossless=True)
    webp = buffer.getvalue()
    name = sha256(webp).hexdigest() + ".webp"
    (root / "media" / name).write_bytes(webp)
    return reference, {"file": name}


def answer_key(sheet):
    answers = sheet["answers"]
    if isinstance(answers, dict):
        return {int(number): (answer, 2) for number, answer in answers.items()}
    return {
        record["question_number"]: (
            record.get("correct_answer", record.get("answer")), record["points"]
        )
        for record in answers
    }


def question_text(source):
    passage = (source.get("passage_template") or source.get("passage") or "").strip()
    if not passage:
        blocks = source.get("sentence_blocks") or source.get("sentence_items") or []
        passage = "\n".join(
            f"({part['label'].strip('()')}) {part['text']}" for part in blocks
        )

    targets = source.get("underline_targets") or source.get("underlined_parts") or []
    if targets:
        pattern = re.compile("|".join(re.escape(target) for target in sorted(set(targets), key=len, reverse=True)))
        if any(target not in passage for target in targets):
            raise ValueError(f"Underlined expression is missing in {source['id']}")
        passage = pattern.sub(lambda match: "<u>" + match[0] + "</u>", passage)

    sentence = next((source[key] for key in ("insert_sentence", "sentence_to_insert", "given_sentence") if source.get(key)), "")
    if sentence:
        passage = "주어진 문장\n" + sentence + "\n\n" + passage
    return passage


def prepare_questions(kind, round_number, groups, key):
    expected = list(range(1, 51))
    questions = [question for group in groups for question in group.get("items", [group])]
    if [question["question_number"] for question in questions] != expected or sorted(key) != expected:
        raise ValueError(f"Invalid question numbering in {kind} {round_number}")
    for question in questions:
        number = question["question_number"]
        if (question["correct_answer"], question["points"]) != key[number]:
            raise ValueError(f"Answer key differs in {kind} {round_number}, question {number}")
        if key[number][0] not in range(1, 5) or key[number][1] != 2:
            raise ValueError(f"Invalid answer in {kind} {round_number}, question {number}")
    return groups


def pack_question(source, kind, media):
    number = source["question_number"]
    illustrations = {
        option["number"]: media[kind, option["image_url"]]["file"]
        for option in source.get("image_options") or []
    }
    choices = []
    for order, option in enumerate(source["options"], 1):
        text = option if isinstance(option, str) else option["text"]
        label = option.get("number", option.get("label", order)) if isinstance(option, dict) else order
        image = illustrations.get(order)
        if int(label) != order or (not text.strip() and not image):
            raise ValueError(f"Invalid option {order} in {source['id']}")
        choices.append({"text": text, "image": image})
    if len(choices) != 4 or not source["question"].strip():
        raise ValueError(f"Invalid choices or prompt in {source['id']}")
    image = source.get("image_url")
    passage = question_text(source) if kind == "reading" else None
    if kind == "reading" and not (passage or image):
        raise ValueError(f"Missing reading material in {source['id']}")
    return {
        "number": number,
        "prompt": source["question"],
        "passage": passage,
        "image": media[kind, image]["file"] if image else None,
        "choices": choices,
        "answer": source["correct_answer"],
        "points": source["points"],
        "explanation": source.get("description") or None if kind == "reading" else None,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    root = parser.parse_args().directory.resolve()
    (root / "media").mkdir(parents=True, exist_ok=True)
    variants = []
    media_references = set()
    checks = []
    for reading, listening, writing in ROUNDS:
        variant = {"writingRound": writing}
        for kind, round_number in (("reading", reading), ("listening", listening)):
            source_path = f"data/exams/{kind}-{round_number}.json"
            answers_path = f"data/answer-keys/answer-key-{round_number}.json"
            source = json.loads(fetch(root, kind, source_path).read_text(encoding="utf-8-sig"))
            sheet = json.loads(fetch(root, kind, answers_path).read_text(encoding="utf-8-sig"))
            groups = prepare_questions(
                kind, round_number, source["items"] if kind == "listening" else source,
                answer_key(sheet),
            )
            checks.append((kind, round_number, len(groups)))
            if kind == "listening":
                if [len(group.get("items", [group])) for group in groups] != [1] * 20 + [2] * 15:
                    raise ValueError(f"Unexpected listening audio groups in {round_number}")
                for group in groups:
                    audio = group["audio_url"]
                    media_references.add((kind, audio))
                    for question in group.get("items", [group]):
                        if question["audio_url"] != audio:
                            raise ValueError(f"Mismatched group audio in {question['id']}")
                        for image in question.get("image_options") or []:
                            media_references.add((kind, image["image_url"]))
            else:
                media_references.update((kind, question["image_url"]) for question in groups if question.get("image_url"))
            variant[kind] = (round_number, groups, source_path, answers_path, sheet.get("answer_key_status"))
        variants.append(variant)

    print(f"Cross-checked {len(checks)} question files against their answer keys. Preparing {len(media_references)} media files.", flush=True)
    with ThreadPoolExecutor(max_workers=12) as workers:
        media = dict(workers.map(lambda reference: prepare_media(root, reference), sorted(media_references)))

    manifest = {"variants": []}
    for variant in variants:
        prepared = {"writingRound": variant["writingRound"]}
        for kind in SOURCES:
            round_number, groups, source_path, answers_path, status = variant[kind]
            prepared[kind] = {
                "round": round_number,
                "source": source_url(kind, source_path),
                "answerKey": source_url(kind, answers_path),
                "answerKeyStatus": status,
                "groups": [
                    {
                        "audio": media[kind, group["audio_url"]] if kind == "listening" else None,
                        "questions": [pack_question(question, kind, media) for question in group.get("items", [group])],
                    }
                    for group in groups
                ],
            }
        manifest["variants"].append(prepared)

    temporary = root / "manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(root / "manifest.json")
    print(f"Prepared {len(variants)} Mock variants in {root / 'manifest.json'}")


if __name__ == "__main__":
    main()
