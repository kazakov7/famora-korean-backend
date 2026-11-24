ALTER TABLE "questions" ADD COLUMN "sampleAnswerImageId" UUID;

ALTER TABLE "questions" ADD CONSTRAINT "questions_sampleAnswerImageId_fkey"
FOREIGN KEY ("sampleAnswerImageId") REFERENCES "media_assets"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
