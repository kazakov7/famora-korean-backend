"""Extract the numbered Korean–Uzbek entries from a TOPIK 1500 booklet."""

import argparse
from dataclasses import dataclass
import json
from pathlib import Path
import re
import subprocess

import fitz


TERM_SEPARATOR = r"\s*(?:\.{1,2}\s*|\s+)"
NUMBERED_TERM = re.compile(rf"(\d{{1,4}}){TERM_SEPARATOR}([가-힣].*)")
NEXT_ENTRY = re.compile(rf"\s{{2,}}(?=\d{{1,4}}{TERM_SEPARATOR}[가-힣])")
FOOTER = re.compile(r"(?:Muallif\s*:.*|(?:\d+\s+끝남\s+)?\d{2}\.\d{2}\.\d{4})")
WRAPPED_CELL = re.compile(r"\S(?:.*?\S)?(?=\s{2,}|$)")


@dataclass(frozen=True)
class Booklet:
    slug: str
    title: str
    groups: tuple[int, ...]
    # Column start, last anchor position, translation start, and column end in PDF points.
    columns: tuple[tuple[int, int, int, int], ...]


BOOKLETS = {
    "beginner": Booklet(
        "1500", "1500 ta 초급 lug‘at", (1004, 270, 116, 80, 82),
        ((45, 51, 163, 298), (300, 306, 426, 596)),
    ),
    "intermediate": Booklet(
        "1500-junggeup", "1500 ta 중급 lug‘at", (660, 510, 180, 150),
        ((35, 55, 155, 285), (285, 320, 405, 596)),
    ),
    "advanced": Booklet(
        "1500-gogeup", "1500 ta 고급 lug‘at", (450, 600, 300, 150),
        ((35, 55, 150, 285), (285, 320, 405, 596)),
    ),
}


@dataclass(frozen=True)
class Entry:
    page: int
    number: int
    term: str
    translation: str


def read_layout(pdf):
    text = subprocess.check_output(
        ["pdftotext", "-layout", str(pdf), "-"], text=True, encoding="utf-8"
    )
    entries = []
    for page, contents in enumerate(text.split("\f"), 1):
        left, right = [], []
        for raw_line in contents.splitlines():
            line = raw_line.strip()
            if not line or FOOTER.fullmatch(line):
                continue
            if not NUMBERED_TERM.match(line):
                if not left:
                    continue
                if not raw_line[0].isspace():
                    raise ValueError(f"Unexpected text on page {page}: {line}")
                # Both translations can wrap on the same printed line.
                for cell in WRAPPED_CELL.finditer(raw_line):
                    column = right if cell.start() >= 35 else left
                    previous = column[-1]
                    column[-1] = Entry(
                        page, previous.number, previous.term, previous.translation + " " + cell[0]
                    )
                continue
            cells = NEXT_ENTRY.split(line)
            if len(cells) != 2:
                raise ValueError(f"Expected two entries on page {page}: {line}")
            for cell, column in zip(cells, (left, right)):
                match = NUMBERED_TERM.fullmatch(cell)
                if not match:
                    raise ValueError(f"Unnumbered entry on page {page}: {cell}")
                fields = re.split(r"\s{2,}", match[2], maxsplit=1)
                if len(fields) != 2 or not fields[1].strip():
                    raise ValueError(f"Missing translation on page {page}: {cell}")
                column.append(Entry(page, int(match[1]), fields[0].strip(), fields[1].strip()))
        entries.extend(left)
        entries.extend(right)
    return entries


def read_coordinates(pdf, pages, columns):
    entries = []
    with fitz.open(pdf) as document:
        for number in sorted(pages):
            words = [
                word for word in document[number - 1].get_text("words")
                if word[1] < 790 and not FOOTER.fullmatch(word[4])
            ]
            for start, anchor_end, split, stop in columns:
                column = [word for word in words if start <= word[0] < stop]
                anchors = sorted(
                    (word for word in column if word[0] <= anchor_end and re.match(r"^\d", word[4])),
                    key=lambda word: word[1],
                )
                bottoms = [anchor[1] - 4 for anchor in anchors[1:]] + [790]
                for anchor, bottom in zip(anchors, bottoms):
                    # A continuation can be one line below the anchor. Distant text is a footer.
                    bottom = min(bottom, anchor[1] + 20)
                    row = sorted(
                        (word for word in column if anchor[1] - 4 <= word[1] < bottom),
                        key=lambda word: word[0],
                    )
                    term_field = " ".join(word[4] for word in row if word[0] < split)
                    translation_words = sorted(
                        (word for word in row if word[0] >= split),
                        key=lambda word: (word[1] >= anchor[1] + 4, word[0]),
                    )
                    translation = " ".join(word[4] for word in translation_words)
                    match = NUMBERED_TERM.fullmatch(term_field)
                    if not match or not translation:
                        raise ValueError(f"Incomplete row on page {number}: {term_field}")
                    entries.append(Entry(number, int(match[1]), match[2], translation))
    return entries


def verify_numbering(entries, expected_groups):
    counts = []
    previous = 0
    for entry in entries:
        if entry.number == 1 and previous:
            counts.append(previous)
            previous = 0
        if entry.number != previous + 1:
            raise ValueError(f"Unexpected entry number on page {entry.page}: {entry.number}")
        previous = entry.number
    counts.append(previous)
    if tuple(counts) != expected_groups:
        raise ValueError(f"Unexpected numbered section lengths: {counts}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--level", choices=BOOKLETS, default="beginner")
    args = parser.parse_args()
    booklet = BOOKLETS[args.level]

    entries = read_layout(args.pdf)
    verify_numbering(entries, booklet.groups)
    coordinates = read_coordinates(args.pdf, {entry.page for entry in entries}, booklet.columns)
    if coordinates != entries:
        for layout, geometry in zip(entries, coordinates):
            if layout != geometry:
                raise ValueError(f"Text and coordinates disagree: {layout} / {geometry}")
        raise ValueError("Text and coordinates contain different numbers of entries")

    collection = {
        "slug": booklet.slug,
        "title": booklet.title,
        "words": [
            {
                "term": entry.term,
                "translation": entry.translation,
                "sourcePage": entry.page,
                "sourceNumber": entry.number,
            }
            for entry in entries
        ],
    }
    args.output.write_text(json.dumps(collection, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {len(entries)} entries across {len({entry.page for entry in entries})} vocabulary pages")


if __name__ == "__main__":
    main()
