import { PrismaClient, type Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
	audioPattern,
	examMediaStorage,
	imagePattern,
	inspectAsset,
	requireData,
	type AssetFile,
} from './exam-import-media';

type Level = 'I' | 'II';
type Kind = 'LISTENING' | 'WRITING' | 'READING';
type Audio = { file: string; durationMs: number };
type Question = {
	number: number;
	points: number;
	choice: number | null;
	pageImage: string;
	questionImage?: string;
	pages: number[];
};
type Section = {
	kind: Kind;
	title: string;
	durationSeconds: number;
	paper: string;
	answerKey: string;
	questions: Question[];
	audio?: Audio & { normalized?: Audio };
	writingSample?: string;
};
type Exam = { round: number; level: Level; source: string; sections: Section[] };

const db = new PrismaClient();
const options = ['①', '②', '③', '④'];
const archive = 'https://www.topikguide.com/previous-papers/';
const sectionFormat = {
	I: {
		LISTENING: { first: 1, count: 30, duration: 2400 },
		READING: { first: 31, count: 40, duration: 3600 },
		WRITING: null,
	},
	II: {
		LISTENING: { first: 1, count: 50, duration: 3600 },
		WRITING: { first: 51, count: 4, duration: 3000 },
		READING: { first: 1, count: 50, duration: 4200 },
	},
};
const writingPoints = [10, 10, 30, 50];

function sourceUrl(value: string) {
	const url = new URL(value);
	requireData(url.protocol === 'https:', 'Expected an HTTPS source URL');
}

function examSlug(exam: Exam) {
	return 'topik-' + exam.level.toLowerCase() + '-' + exam.round;
}

function title(exam: Exam) {
	return '제' + exam.round + '회 한국어능력시험 TOPIK ' + exam.level;
}

function audioTrack(section: Section, revised: boolean) {
	return revised ? (section.audio?.normalized ?? section.audio) : section.audio;
}

function duration(section: Section, revised: boolean) {
	const audio = audioTrack(section, revised);
	if (!audio) return section.durationSeconds;
	const playbackSeconds = Math.ceil(audio.durationMs / 1000);
	return Math.max(section.durationSeconds, playbackSeconds + 30);
}

function imageName(question: Question, cropped: boolean) {
	return cropped ? (question.questionImage ?? question.pageImage) : question.pageImage;
}

function hasQuestionImages(exam: Exam) {
	return exam.sections.some((section) =>
		section.questions.some((question) => question.questionImage !== undefined),
	);
}

function hasRevisedMedia(exam: Exam) {
	return (
		hasQuestionImages(exam) || exam.sections.some((section) => section.audio?.normalized)
	);
}

function validate(exams: Exam[]) {
	requireData(Array.isArray(exams) && exams.length, 'The dataset has no exams');
	const rounds = new Map<number, Set<Level>>();
	const media = new Set<string>();
	for (const exam of exams) {
		requireData(exam.level === 'I' || exam.level === 'II', 'Expected TOPIK I or II');
		requireData(Number.isInteger(exam.round) && exam.round >= 35, 'Invalid round number');
		sourceUrl(exam.source);
		const levels = rounds.get(exam.round) ?? new Set<Level>();
		requireData(!levels.has(exam.level), 'Duplicate exam ' + examSlug(exam));
		levels.add(exam.level);
		rounds.set(exam.round, levels);
		const cropped = hasQuestionImages(exam);
		const expected =
			exam.level === 'I' ? ['LISTENING', 'READING'] : ['LISTENING', 'WRITING', 'READING'];
		requireData(
			exam.sections.map((section) => section.kind).join() === expected.join(),
			'Invalid section order in ' + examSlug(exam),
		);
		for (const section of exam.sections) {
			const location = examSlug(exam) + ' ' + section.kind;
			const writing = section.kind === 'WRITING';
			const sectionRules = sectionFormat[exam.level][section.kind];
			requireData(sectionRules, 'Unexpected section for ' + location);
			sourceUrl(section.paper);
			sourceUrl(section.answerKey);
			requireData(
				section.title.trim() && section.durationSeconds === sectionRules.duration,
				'Invalid section metadata for ' + location,
			);
			requireData(
				section.questions.length === sectionRules.count,
				'Unexpected question count for ' + location,
			);
			let points = 0;
			for (const [index, question] of section.questions.entries()) {
				requireData(
					question.number === sectionRules.first + index,
					'Unexpected question number for ' + location,
				);
				requireData(
					imagePattern.test(question.pageImage),
					'Invalid question image for ' + location,
				);
				requireData(
					question.pages.length &&
						question.pages.every((page) => Number.isInteger(page) && page >= 1),
					'Invalid source page for ' + location,
				);
				if (writing) {
					requireData(
						question.choice === null && question.points === writingPoints[index],
						'Invalid writing points for ' + location,
					);
				} else {
					requireData(
						question.choice !== null &&
							Number.isInteger(question.choice) &&
							question.choice >= 1 &&
							question.choice <= 4,
						'Invalid answer key for ' + location,
					);
					requireData(
						exam.level === 'I'
							? [2, 3, 4].includes(question.points)
							: question.points === 2,
						'Invalid question points for ' + location,
					);
				}
				points += question.points;
				media.add(question.pageImage);
				if (cropped) {
					requireData(
						question.questionImage &&
							imagePattern.test(question.questionImage) &&
							question.questionImage !== question.pageImage,
						'Missing question-specific image for ' + location + ' ' + question.number,
					);
					media.add(question.questionImage);
				}
			}
			requireData(points === 100, 'The published score must total 100 for ' + location);
			if (writing) {
				requireData(
					section.writingSample && imagePattern.test(section.writingSample),
					'Missing official writing sample for ' + location,
				);
				media.add(section.writingSample);
			}
			if (section.kind === 'LISTENING') {
				const audio = section.audio;
				requireData(
					audio &&
						audioPattern.test(audio.file) &&
						Number.isInteger(audio.durationMs) &&
						audio.durationMs > 0,
					'Invalid listening audio for ' + location,
				);
				media.add(audio.file);
				const normalized = audio.normalized;
				if (normalized) {
					requireData(
						audioPattern.test(normalized.file) &&
							normalized.file !== audio.file &&
							Number.isInteger(normalized.durationMs) &&
							normalized.durationMs > 0,
						'Invalid normalized listening media for ' + location,
					);
					media.add(normalized.file);
				}
			}
		}
	}
	requireData(
		[...rounds.values()].every((levels) => levels.size === 2),
		'Each round needs TOPIK I and TOPIK II',
	);
	return media;
}

async function verifyExisting(tx: Prisma.TransactionClient, exam: Exam, prefix: string) {
	const found = await tx.exam.findUnique({
		where: { slug: examSlug(exam) },
		include: {
			_count: { select: { versions: true } },
			versions: {
				where: { publishedAt: { not: null } },
				orderBy: { number: 'desc' },
				include: {
					variants: {
						include: {
							sections: {
								orderBy: { sortOrder: 'asc' },
								include: {
									groups: { include: { audio: true } },
									questions: {
										orderBy: { sortOrder: 'asc' },
										include: { choices: true, image: true, sampleAnswerImage: true },
									},
								},
							},
						},
					},
				},
			},
		},
	});
	if (!found) return null;
	requireData(
		found.kind === 'OFFICIAL' && found.languageCode === 'ko',
		'A different exam already uses the slug ' + examSlug(exam),
	);
	const original = found.versions.find((version) => version.number === 1);
	const current = found.versions.find((version) => version.id === found.currentVersionId);
	function matches(
		version: typeof original,
		useQuestionImages: boolean,
		useNormalizedAudio = useQuestionImages,
	) {
		const sections = version?.variants[0]?.sections ?? [];
		return (
			version?.title === title(exam) &&
			version.description === '공개 기출문제' &&
			version.coverId === null &&
			version.variants.length === 1 &&
			sections.length === exam.sections.length &&
			sections.every((section, index) => {
				const expected = exam.sections[index];
				if (!expected) return false;
				const audio = audioTrack(expected, useNormalizedAudio);
				return (
					section.kind === expected.kind &&
					section.title === expected.title &&
					section.instructions === null &&
					section.durationSeconds === duration(expected, useNormalizedAudio) &&
					(!audio ||
						(section.groups[0]?.audio?.key === prefix + audio.file &&
							section.groups[0]?.audioEndMs === audio.durationMs)) &&
					section.questions.length === expected.questions.length &&
					section.questions.every((question, i) => {
						const source = expected.questions[i];
						return (
							source &&
							question.sortOrder === source.number &&
							question.points === source.points &&
							question.image?.key === prefix + imageName(source, useQuestionImages) &&
							(expected.writingSample
								? question.sampleAnswerImage?.key === prefix + expected.writingSample
								: question.choices.find((choice) => choice.correct)?.sortOrder ===
									source.choice)
						);
					})
				);
			})
		);
	}
	const useRevisedMedia = hasRevisedMedia(exam);
	const knownImport = {
		id: found.id,
		currentVersionId: found.currentVersionId,
		revision: null as number | null,
	};
	if (useRevisedMedia && matches(current, true)) return knownImport;
	if (!useRevisedMedia) {
		requireData(
			matches(original, false),
			'A different exam already uses the slug ' + examSlug(exam),
		);
		return knownImport;
	}
	requireData(
		current &&
			current.id === found.versions[0]?.id &&
			found._count.versions === found.versions.length &&
			(matches(current, false) ||
				matches(current, true, false) ||
				matches(current, false, true)),
		'The published import or its draft has been edited for ' + examSlug(exam),
	);
	return { ...knownImport, revision: current.number + 1 };
}

async function insert(
	exam: Exam,
	ownerId: string,
	familyId: string,
	menuId: string,
	files: Map<string, AssetFile>,
	prefix: string,
) {
	return db.$transaction(
		async (tx) => {
			const existing = await verifyExisting(tx, exam, prefix);
			if (existing && !existing.revision) return 'already imported';
			const useRevisedMedia = hasRevisedMedia(exam);
			const now = new Date();
			const record =
				existing ??
				(await tx.exam.create({
					data: {
						slug: examSlug(exam),
						kind: 'OFFICIAL',
						languageCode: 'ko',
						familyId,
						menus: { create: { menuId, sortOrder: exam.round } },
					},
				}));
			const version = await tx.examVersion.create({
				data: {
					examId: record.id,
					number: existing?.revision ?? 1,
					title: title(exam),
					description: '공개 기출문제',
					durationSeconds: exam.sections.reduce(
						(sum, section) => sum + duration(section, useRevisedMedia),
						0,
					),
					publishedAt: now,
					variants: { create: { label: '공개 기출문제', sortOrder: 0 } },
				},
				include: { variants: true },
			});
			const variant = version.variants[0];
			requireData(variant, 'Exam variant could not be created');
			const assetIds = new Map<string, string>();
			async function asset(name: string, durationMs?: number) {
				const cached = assetIds.get(name);
				if (cached) return cached;
				const file = files.get(name);
				requireData(file, 'Asset is absent from the validated media set');
				const key = prefix + name;
				const row = await tx.mediaAsset.upsert({
					where: { key },
					create: {
						key,
						ownerId,
						contentType: file.contentType,
						sizeBytes: file.sizeBytes,
						durationMs,
						uploadedAt: now,
					},
					update: {},
					select: { id: true },
				});
				assetIds.set(name, row.id);
				return row.id;
			}

			for (const [sortOrder, source] of exam.sections.entries()) {
				const section = await tx.examSection.create({
					data: {
						variantId: variant.id,
						sortOrder,
						kind: source.kind,
						title: source.title,
						durationSeconds: duration(source, useRevisedMedia),
					},
				});
				let groupId: string | undefined;
				const audio = audioTrack(source, useRevisedMedia);
				if (audio) {
					const group = await tx.questionGroup.create({
						data: {
							sectionId: section.id,
							audioId: await asset(audio.file, audio.durationMs),
							audioStartMs: 0,
							audioEndMs: audio.durationMs,
							audioMaxPlays: 1,
						},
					});
					groupId = group.id;
				}
				const sampleAnswerImageId = source.writingSample
					? await asset(source.writingSample)
					: undefined;
				const questions: Prisma.QuestionCreateManyInput[] = [];
				const choices: Prisma.ChoiceCreateManyInput[] = [];
				for (const question of source.questions) {
					const questionId = randomUUID();
					questions.push({
						id: questionId,
						sectionId: section.id,
						groupId,
						sampleAnswerImageId,
						kind: question.choice === null ? 'TEXT' : 'CHOICE',
						prompt: question.number + '번',
						sortOrder: question.number,
						points: question.points,
						imageId: await asset(imageName(question, useRevisedMedia)),
					});
					if (question.choice !== null) {
						choices.push(
							...options.map((text, i) => ({
								questionId,
								text,
								sortOrder: i + 1,
								correct: question.choice === i + 1,
							})),
						);
					}
				}
				await tx.question.createMany({ data: questions });
				if (choices.length) await tx.choice.createMany({ data: choices });
			}
			const published = await tx.exam.updateMany({
				where: { id: record.id, currentVersionId: record.currentVersionId },
				data: { currentVersionId: version.id },
			});
			requireData(
				published.count === 1,
				'The published version changed for ' + examSlug(exam),
			);
			return existing ? 'published updated exam media' : 'published';
		},
		{ timeout: 30000 },
	);
}

async function main() {
	const input = process.argv[2];
	const nickname = process.argv[3]?.trim().normalize('NFKC').toLocaleLowerCase('en-US');
	requireData(
		input && nickname,
		'Usage: npm run topik:import -- <manifest.json> <admin nickname>',
	);
	const manifestPath = resolve(input);
	const directory = resolve(dirname(manifestPath), 'media');
	const { source, exams } = JSON.parse(await readFile(manifestPath, 'utf8')) as {
		source: string;
		exams: Exam[];
	};
	requireData(source === archive, 'Unexpected TOPIK archive');
	const names = validate(exams);
	const target = examMediaStorage(directory);
	const files = new Map<string, AssetFile>();
	for (const name of names) files.set(name, await inspectAsset(directory, name));
	const [owner, family, menus] = await Promise.all([
		db.member.findFirst({
			where: { memberNickKey: nickname, role: 'ADMIN' },
			select: { id: true },
		}),
		db.examFamily.findUnique({
			where: { languageCode_key: { languageCode: 'ko', key: 'TOPIK' } },
		}),
		db.menu.findMany({
			where: { systemKey: { in: ['TOPIK_I', 'TOPIK_II'] }, published: true },
		}),
	]);
	requireData(
		owner && family && menus.length === 2,
		'An administrator, the TOPIK family and both published menus are required',
	);
	await target.upload([...files.values()]);
	for (const exam of exams) {
		const menu = menus.find(({ systemKey }) => systemKey === 'TOPIK_' + exam.level);
		requireData(menu, 'TOPIK menu is missing');
		const status = await insert(exam, owner.id, family.id, menu.id, files, target.prefix);
		console.log(examSlug(exam), status);
	}
	console.log('Validated', exams.length, 'exams and', files.size, 'media objects');
}

main()
	.catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : 'TOPIK import failed');
		process.exitCode = 1;
	})
	.finally(() => db.$disconnect());
