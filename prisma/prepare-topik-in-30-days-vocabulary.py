"""Extract the 30 daily Korean–Uzbek word tables from TOPIK In 30 Days."""

import argparse
import json
from pathlib import Path
import re

import fitz


DAY_COUNT = 30
WORDS_PER_COLUMN = 17
KOREAN = re.compile(r"[가-힣]")
SEPARATED_WORD = re.compile(r"(.+?)\s*[-–]\s*(.+)")
WORD_WITHOUT_DASH = re.compile(r"([가-힣]+)\s+([a-zA-Z].*)")


def read_day(page, day):
    heading = page.get_text(clip=fitz.Rect(20, 24, 65, 46))
    if "".join(heading.split()) != f"T{day}":
        raise ValueError(f"Missing Day {day} heading")

    tables = page.find_tables().tables
    if day == DAY_COUNT + 1 and not tables:
        return []
    if len(tables) != 1 or tables[0].row_count != WORDS_PER_COLUMN or tables[0].col_count != 4:
        raise ValueError(f"Unexpected table on Day {day}")

    table = tables[0]
    columns = ([], [])
    for row_number, (row, values) in enumerate(zip(table.rows, table.extract(), strict=True), 1):
        cells = [" ".join(value.split()) for value in values]
        for cell, bounds in zip(cells, row.cells, strict=True):
            if cell != " ".join(page.get_text(clip=fitz.Rect(bounds)).split()):
                raise ValueError(f"Cell text disagrees on Day {day}, row {row_number}")
        for index, column in enumerate(columns):
            number = row_number + index * WORDS_PER_COLUMN
            label = f"Day {day}, word {number}"
            printed_number, cell = cells[index * 2:index * 2 + 2]
            if printed_number != str(number):
                raise ValueError(f"Wrong numbering on {label}")
            if not cell and number == WORDS_PER_COLUMN * 2:
                continue
            if (day, number, cell) == (21, 11, "대하다 -"):
                # The source cell has a Korean word and an empty translation.
                term, translation = "대하다", "muomala qilmoq"
            else:
                match = SEPARATED_WORD.fullmatch(cell) or WORD_WITHOUT_DASH.fullmatch(cell)
                if not match or not KOREAN.search(match[1]):
                    raise ValueError(f"Invalid vocabulary on {label}: {cell!r}")
                term, translation = (part.strip() for part in match.groups())
            column.append({
                "term": term,
                "translation": translation,
                "sourcePage": page.number + 1,
                "sourceNumber": number,
            })
    return columns[0] + columns[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    with fitz.open(args.pdf) as document:
        if len(document) != DAY_COUNT + 2:
            raise ValueError("Expected the cover, 30 daily tables, and the final blank day")
        units = [
            {"title": f"Day {day}", "words": read_day(document[day], day)}
            for day in range(1, DAY_COUNT + 1)
        ]
        if read_day(document[DAY_COUNT + 1], DAY_COUNT + 1):
            raise ValueError("Expected the final day to be blank")

    total = sum(len(unit["words"]) for unit in units)
    if total != 1000:
        raise ValueError(f"Expected 1000 vocabulary entries, found {total}")
    collection = {"slug": "topik-in-30-days", "title": "TOPIK In 30 Days", "units": units}
    args.output.write_text(json.dumps(collection, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {total} vocabulary entries across {len(units)} days")


if __name__ == "__main__":
    main()
