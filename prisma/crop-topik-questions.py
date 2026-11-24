"""Build question-sized images from a reviewed TOPIK booklet layout."""

import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path

import fitz
from PIL import Image


def clipped_image(page, horizontal, top, bottom):
    left, right = horizontal
    if not (0 <= left < right <= page.rect.width and 0 <= top < bottom <= page.rect.height):
        raise ValueError(f"Invalid crop on PDF page {page.number + 1}")
    rectangle = fitz.Rect(left, top, right, bottom)
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), clip=rectangle, colorspace=fitz.csRGB)
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    bounds = image.convert("L").point(lambda value: 255 if value < 155 else 0).getbbox()
    if not bounds:
        raise ValueError(f"Empty crop on PDF page {page.number + 1} at y={top}")
    return image.crop(bounds)


def store_question(media, body, context):
    images = [context, body] if context else [body]
    padding = 16
    width = max(image.width for image in images)
    height = sum(image.height for image in images)
    combined = Image.new("RGB", (width + padding * 2, height + padding * (len(images) + 1)), "white")
    top = padding
    for image in images:
        combined.paste(image, (padding, top))
        top += image.height + padding
    encoded = BytesIO()
    combined.save(encoded, format="webp", quality=94, method=4)
    payload = encoded.getvalue()
    name = sha256(payload).hexdigest() + ".webp"
    (media / name).write_bytes(payload)
    return name


def crop_section(document, pages, horizontal, media):
    questions = {}
    shared = None
    for printed_page, bottom, marks in pages:
        page = document[printed_page - 1]
        for (top, label), (end, _) in zip(marks, [*marks[1:], [bottom, None]]):
            region = clipped_image(page, horizontal, top, end)
            if isinstance(label, str):
                first, last = map(int, label.split("-"))
                shared = (range(first, last + 1), region)
                continue
            if label in questions:
                raise ValueError(f"Repeated question {label}")
            context = shared[1] if shared and label in shared[0] else None
            questions[label] = (printed_page, store_question(media, region, context))
    return questions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("papers", type=Path, help="Root containing the round folders with the PDFs")
    parser.add_argument("layouts", type=Path, nargs="+")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    original = json.loads(args.manifest.read_text(encoding="utf-8"))
    exams = {(exam["round"], exam["level"]): exam for exam in original["exams"]}
    media = args.output.parent / "media"
    media.mkdir(exist_ok=True, parents=True)
    seen = set()
    for layout_path in args.layouts:
        layout = json.loads(layout_path.read_text(encoding="utf-8"))
        key = (layout["round"], layout["level"])
        exam = exams[key]
        if key in seen:
            raise ValueError(f"Repeated layout for {key}")
        seen.add(key)
        folder = args.papers / f"{key[0]}-{key[1]}"
        for section in exam["sections"]:
            kind = section["kind"]
            regions = layout["sections"][kind]
            with fitz.open(folder / regions["paper"]) as document:
                crops = crop_section(document, regions["pages"], layout["horizontal"], media)
            expected = {question["number"]: question["pages"][-1] for question in section["questions"]}
            if {number: item[0] for number, item in crops.items()} != expected:
                raise ValueError(f"Question and source page mismatch for {key} {kind}")
            for question in section["questions"]:
                question["questionImage"] = crops[question["number"]][1]
        print(f"Prepared {key[0]} TOPIK {key[1]} with {sum(len(s['questions']) for s in exam['sections'])} question images")

    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(original, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)


if __name__ == "__main__":
    main()
