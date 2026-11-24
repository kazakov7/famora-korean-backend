ALTER TYPE "ExamKind" ADD VALUE 'VOCABULARY';
ALTER TYPE "SectionKind" ADD VALUE 'VOCABULARY';

INSERT INTO "menus" ("id", "slug", "systemKey", "name", "sortOrder", "published")
VALUES ('b2ec40ce-0027-4a93-95df-36840fd7688d', 'vocabulary', 'VOCABULARY', 'Lug‘atlar', 4, true);
