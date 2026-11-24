WITH book AS (
    INSERT INTO "menus" ("id", "parentId", "slug", "name", "sortOrder", "published")
    SELECT '28f05b7e-6db1-4129-81be-2dee96552369', "id", 'ssok-ssok', '쏙-쏙', 0, true
    FROM "menus"
    WHERE "systemKey" = 'VOCABULARY'
    RETURNING "id"
)
INSERT INTO "menus" ("id", "parentId", "slug", "name", "sortOrder", "published")
SELECT "level"."id"::uuid, "book"."id", "level"."slug", "level"."name", "level"."position", true
FROM "book"
CROSS JOIN (
    VALUES
        ('63329517-fcea-4d1f-8c82-bffcd275aaa5', 'vocab-1500', '초급', 0),
        ('aedd064d-86ad-4c05-811d-602d80651d11', 'ssok-ssok-junggeup', '중급', 1),
        ('0c60b47a-da8e-4b13-876f-7bb662079f87', 'ssok-ssok-gogeup', '고급', 2)
) AS "level" ("id", "slug", "name", "position")
ON CONFLICT ("slug") DO UPDATE
SET "parentId" = EXCLUDED."parentId",
    "name" = EXCLUDED."name",
    "sortOrder" = EXCLUDED."sortOrder",
    "published" = EXCLUDED."published"
WHERE "menus"."slug" = 'vocab-1500';
