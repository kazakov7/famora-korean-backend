ALTER TABLE "exams" ADD COLUMN "dailyPracticeDate" DATE;

CREATE UNIQUE INDEX "exams_dailyPracticeDate_key" ON "exams"("dailyPracticeDate");
