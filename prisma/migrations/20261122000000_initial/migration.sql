-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('MEMBER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('NICKNAME', 'GOOGLE', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "ChallengePurpose" AS ENUM ('LINK_GMAIL', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "ExamKind" AS ENUM ('OFFICIAL', 'MOCK');

-- CreateEnum
CREATE TYPE "SectionKind" AS ENUM ('LISTENING', 'READING', 'WRITING');

-- CreateEnum
CREATE TYPE "QuestionKind" AS ENUM ('CHOICE', 'TEXT');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SubmissionReason" AS ENUM ('MANUAL', 'TIMEOUT');

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "memberNick" TEXT NOT NULL,
    "memberNickKey" TEXT NOT NULL,
    "memberFullName" TEXT NOT NULL,
    "memberPhone" TEXT,
    "memberAge" INTEGER,
    "providerImageUrl" TEXT,
    "memberImageId" UUID,
    "memberAuthType" "AuthMethod" NOT NULL,
    "memberPoints" INTEGER NOT NULL DEFAULT 0,
    "recoveryEmail" TEXT,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "method" "AuthMethod" NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_credentials" (
    "memberId" UUID NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "password_credentials_pkey" PRIMARY KEY ("memberId")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "method" "AuthMethod" NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_challenges" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "purpose" "ChallengePurpose" NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "grantHash" TEXT,
    "grantExpiresAt" TIMESTAMP(3),
    "grantUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_flows" (
    "id" TEXT NOT NULL,
    "method" "AuthMethod" NOT NULL,
    "verifier" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "memberId" UUID,
    "returnTo" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_throttles" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_throttles_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "exam_languages" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "exam_languages_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "exam_families" (
    "id" UUID NOT NULL,
    "languageCode" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "exam_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" UUID NOT NULL,
    "parentId" UUID,
    "slug" TEXT NOT NULL,
    "systemKey" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "ExamKind" NOT NULL,
    "languageCode" TEXT NOT NULL,
    "familyId" UUID,
    "currentVersionId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_menu_links" (
    "examId" UUID NOT NULL,
    "menuId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "exam_menu_links_pkey" PRIMARY KEY ("examId","menuId")
);

-- CreateTable
CREATE TABLE "exam_versions" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationSeconds" INTEGER NOT NULL,
    "coverId" UUID,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_variants" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "exam_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_sections" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "kind" "SectionKind" NOT NULL,
    "title" TEXT,
    "instructions" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "audioMaxPlays" INTEGER,

    CONSTRAINT "exam_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_groups" (
    "id" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "passage" TEXT,
    "imageId" UUID,
    "audioId" UUID,
    "audioStartMs" INTEGER,
    "audioEndMs" INTEGER,
    "audioMaxPlays" INTEGER,

    CONSTRAINT "question_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "groupId" UUID,
    "kind" "QuestionKind" NOT NULL,
    "prompt" TEXT NOT NULL,
    "imageId" UUID,
    "sortOrder" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "explanation" TEXT,
    "sampleAnswer" TEXT,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "choices" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "text" TEXT,
    "imageId" UUID,
    "sortOrder" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,

    CONSTRAINT "choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "durationMs" INTEGER NOT NULL,
    "deadlineAt" TIMESTAMP(3),
    "remainingMs" INTEGER NOT NULL,
    "currentQuestionId" UUID,
    "reason" "SubmissionReason",
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "choiceId" UUID,
    "text" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("attemptId","questionId")
);

-- CreateTable
CREATE TABLE "attempt_audio_state" (
    "attemptId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "positionMs" INTEGER NOT NULL DEFAULT 0,
    "playbackId" UUID,
    "playing" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attempt_audio_state_pkey" PRIMARY KEY ("attemptId","groupId")
);

-- CreateTable
CREATE TABLE "attempt_section_results" (
    "attemptId" UUID NOT NULL,
    "section" "SectionKind" NOT NULL,
    "correct" INTEGER NOT NULL,
    "wrong" INTEGER NOT NULL,
    "unanswered" INTEGER NOT NULL,
    "ungraded" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "attempt_section_results_pkey" PRIMARY KEY ("attemptId","section")
);

-- CreateTable
CREATE TABLE "point_events" (
    "memberId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_events_pkey" PRIMARY KEY ("memberId","examId","scope")
);

-- CreateTable
CREATE TABLE "vocabulary_entries" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "languageCode" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "termKey" TEXT NOT NULL,
    "translation" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocabulary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_sources" (
    "entryId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vocabulary_sources_pkey" PRIMARY KEY ("entryId","questionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_memberNickKey_key" ON "members"("memberNickKey");

-- CreateIndex
CREATE UNIQUE INDEX "members_recoveryEmail_key" ON "members"("recoveryEmail");

-- CreateIndex
CREATE INDEX "members_memberPoints_idx" ON "members"("memberPoints");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_method_subject_key" ON "auth_identities"("method", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_memberId_method_key" ON "auth_identities"("memberId", "method");

-- CreateIndex
CREATE INDEX "auth_sessions_memberId_revokedAt_idx" ON "auth_sessions"("memberId", "revokedAt");

-- CreateIndex
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "auth_challenges_memberId_purpose_createdAt_idx" ON "auth_challenges"("memberId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "oauth_flows_expiresAt_idx" ON "oauth_flows"("expiresAt");

-- CreateIndex
CREATE INDEX "auth_throttles_expiresAt_idx" ON "auth_throttles"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "exam_families_languageCode_key_key" ON "exam_families"("languageCode", "key");

-- CreateIndex
CREATE UNIQUE INDEX "menus_slug_key" ON "menus"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "menus_systemKey_key" ON "menus"("systemKey");

-- CreateIndex
CREATE INDEX "menus_parentId_sortOrder_idx" ON "menus"("parentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "exams_slug_key" ON "exams"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "exams_currentVersionId_key" ON "exams"("currentVersionId");

-- CreateIndex
CREATE INDEX "exams_kind_languageCode_archivedAt_idx" ON "exams"("kind", "languageCode", "archivedAt");

-- CreateIndex
CREATE INDEX "exam_menu_links_menuId_sortOrder_idx" ON "exam_menu_links"("menuId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "exam_versions_examId_number_key" ON "exam_versions"("examId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "exam_variants_versionId_sortOrder_key" ON "exam_variants"("versionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "exam_sections_variantId_kind_key" ON "exam_sections"("variantId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "exam_sections_variantId_sortOrder_key" ON "exam_sections"("variantId", "sortOrder");

-- CreateIndex
CREATE INDEX "question_groups_sectionId_idx" ON "question_groups"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "questions_sectionId_sortOrder_key" ON "questions"("sectionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "choices_questionId_sortOrder_key" ON "choices"("questionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_key_key" ON "media_assets"("key");

-- CreateIndex
CREATE INDEX "media_assets_ownerId_createdAt_idx" ON "media_assets"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "attempts_memberId_examId_mode_createdAt_idx" ON "attempts"("memberId", "examId", "mode", "createdAt");

-- CreateIndex
CREATE INDEX "attempts_memberId_status_completedAt_idx" ON "attempts"("memberId", "status", "completedAt");

-- CreateIndex
CREATE INDEX "attempts_status_deadlineAt_idx" ON "attempts"("status", "deadlineAt");

-- CreateIndex
CREATE INDEX "vocabulary_entries_memberId_createdAt_idx" ON "vocabulary_entries"("memberId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_entries_memberId_languageCode_termKey_key" ON "vocabulary_entries"("memberId", "languageCode", "termKey");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_memberImageId_fkey" FOREIGN KEY ("memberImageId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_credentials" ADD CONSTRAINT "password_credentials_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_flows" ADD CONSTRAINT "oauth_flows_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_families" ADD CONSTRAINT "exam_families_languageCode_fkey" FOREIGN KEY ("languageCode") REFERENCES "exam_languages"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_languageCode_fkey" FOREIGN KEY ("languageCode") REFERENCES "exam_languages"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "exam_families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "exam_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_menu_links" ADD CONSTRAINT "exam_menu_links_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_menu_links" ADD CONSTRAINT "exam_menu_links_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_versions" ADD CONSTRAINT "exam_versions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_versions" ADD CONSTRAINT "exam_versions_coverId_fkey" FOREIGN KEY ("coverId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_variants" ADD CONSTRAINT "exam_variants_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "exam_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sections" ADD CONSTRAINT "exam_sections_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "exam_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_groups" ADD CONSTRAINT "question_groups_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "exam_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_groups" ADD CONSTRAINT "question_groups_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_groups" ADD CONSTRAINT "question_groups_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "exam_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "question_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "choices" ADD CONSTRAINT "choices_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "choices" ADD CONSTRAINT "choices_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "exam_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "exam_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_choiceId_fkey" FOREIGN KEY ("choiceId") REFERENCES "choices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_audio_state" ADD CONSTRAINT "attempt_audio_state_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_audio_state" ADD CONSTRAINT "attempt_audio_state_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "question_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_section_results" ADD CONSTRAINT "attempt_section_results_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_entries" ADD CONSTRAINT "vocabulary_entries_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_entries" ADD CONSTRAINT "vocabulary_entries_languageCode_fkey" FOREIGN KEY ("languageCode") REFERENCES "exam_languages"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_sources" ADD CONSTRAINT "vocabulary_sources_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "vocabulary_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_sources" ADD CONSTRAINT "vocabulary_sources_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_sources" ADD CONSTRAINT "vocabulary_sources_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_sources" ADD CONSTRAINT "vocabulary_sources_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Stable catalog locations used by the Next.js routes.
INSERT INTO "exam_languages" ("code", "name", "active") VALUES ('ko', '한국어', true);
INSERT INTO "exam_families" ("id", "languageCode", "key", "name")
VALUES ('a1000000-0000-4000-8000-000000000001', 'ko', 'TOPIK', 'TOPIK');

INSERT INTO "menus" ("id", "parentId", "slug", "systemKey", "name", "sortOrder", "published")
VALUES
    ('a1000000-0000-4000-8000-000000000002', NULL, 'topik', 'TOPIK', 'TOPIK', 0, true),
    ('a1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', 'topik-1', 'TOPIK_I', 'TOPIK I', 0, true),
    ('a1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000002', 'topik-2', 'TOPIK_II', 'TOPIK II', 1, true),
    ('a1000000-0000-4000-8000-000000000005', NULL, 'mock-exam', 'MOCK_EXAM', 'Mock Exam', 1, true);
