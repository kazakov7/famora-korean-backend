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

type MockQuestion = {
	number: number;
	prompt: string;
	passage: string | null;
	image: string | null;
	choices: { text: string; image: string | null }[];
	answer: number;
	points: number;
	explanation: string | null;
};
type MockGroup = {
	audio: { file: string; durationMs: number } | null;
	questions: MockQuestion[];
};
type MockSection = { round: number; groups: MockGroup[] };
type MockVariant = { writingRound: number; reading: MockSection; listening: MockSection };

const db = new PrismaClient();
const slug = 'topik-ii-mock-exam';
const title = 'TOPIK II 모의고사';
const mcqSections = {
	listening: { kind: 'LISTENING', title: '듣기', sortOrder: 0, durationSeconds: 3600 },
	reading: { kind: 'READING', title: '읽기', sortOrder: 2, durationSeconds: 4200 },
} as const;
const writing = {
	kind: 'WRITING',
	title: '쓰기',
	sortOrder: 1,
	durationSeconds: 3000,
} as const;
const sectionNames = ['listening', 'reading'] as const;

function label(index: number) {
	return '모의고사 ' + String(index + 1).padStart(2, '0');
}

function validate(variants: MockVariant[]) {
	requireData(
		Array.isArray(variants) && variants.length === 10,
		'Expected ten Mock variants',
	);
	const assets = new Map<string, number | undefined>();
	const writingRounds = new Set<number>();
	let longestPlaybackMs = 0;
	function image(name: string | null) {
		if (name === null) return;
		requireData(imagePattern.test(name), 'Invalid image filename');
		assets.set(name, undefined);
	}

	for (const [index, variant] of variants.entries()) {
		requireData(
			Number.isInteger(variant.writingRound) &&
				variant.writingRound >= 35 &&
				!writingRounds.has(variant.writingRound),
			'Invalid or repeated official writing round',
		);
		writingRounds.add(variant.writingRound);
		for (const name of sectionNames) {
			const section = variant[name];
			const where = label(index) + ' ' + name + ' ' + section.round;
			const listening = name === 'listening';
			requireData(
				section.groups.length === (listening ? 35 : 50),
				'Unexpected group count for ' + where,
			);
			let number = 0;
			let playbackMs = 0;
			for (const [groupIndex, group] of section.groups.entries()) {
				const { audio, questions } = group;
				requireData(
					questions.length === (listening && groupIndex >= 20 ? 2 : 1),
					'Invalid group size for ' + where,
				);
				if (listening) {
					requireData(
						audio &&
							audioPattern.test(audio.file) &&
							Number.isInteger(audio.durationMs) &&
							audio.durationMs > 0,
						'Invalid listening media for ' + where,
					);
					assets.set(audio.file, audio.durationMs);
					playbackMs += audio.durationMs;
				} else {
					requireData(audio === null, 'Unexpected reading audio for ' + where);
				}
				for (const question of questions) {
					number += 1;
					requireData(
						question.number === number &&
							question.prompt.trim() &&
							question.points === 2 &&
							[1, 2, 3, 4].includes(question.answer) &&
							question.choices.length === 4 &&
							(listening || question.passage?.trim() || question.image),
						'Invalid question ' + number + ' for ' + where,
					);
					image(question.image);
					for (const choice of question.choices) {
						requireData(
							choice.text.trim() || choice.image,
							'Missing choice content for ' + where,
						);
						image(choice.image);
					}
				}
			}
			longestPlaybackMs = Math.max(longestPlaybackMs, playbackMs);
		}
	}
	return { assets, writingRounds: [...writingRounds], longestPlaybackMs };
}

const writingSelect = {
	sortOrder: true,
	kind: true,
	prompt: true,
	points: true,
	imageId: true,
	explanation: true,
	sampleAnswer: true,
	sampleAnswerImageId: true,
} satisfies Prisma.QuestionSelect;

async function officialWriting(tx: Prisma.TransactionClient, writingRounds: number[]) {
	const slugs = writingRounds.map((round) => 'topik-ii-' + round);
	const exams = await tx.exam.findMany({
		where: { slug: { in: slugs }, kind: 'OFFICIAL', languageCode: 'ko' },
		select: {
			slug: true,
			versions: {
				where: { number: 1, publishedAt: { not: null } },
				select: {
					variants: {
						where: { sortOrder: 0 },
						select: {
							sections: {
								where: { kind: 'WRITING' },
								select: {
									questions: { orderBy: { sortOrder: 'asc' }, select: writingSelect },
								},
							},
						},
					},
				},
			},
		},
	});
	return slugs.map((sourceSlug) => {
		const source = exams.find((exam) => exam.slug === sourceSlug);
		const questions = source?.versions[0]?.variants[0]?.sections[0]?.questions;
		requireData(
			questions?.length === 4 &&
				questions.every(
					(question, index) =>
						question.sortOrder === index + 51 &&
						question.points === [10, 10, 30, 50][index] &&
						question.kind === 'TEXT' &&
						question.imageId &&
						(question.sampleAnswerImageId || question.sampleAnswer),
				),
			'Import the official writing tasks for ' + sourceSlug + ' first',
		);
		return questions;
	});
}

async function setQuestions(
	tx: Prisma.TransactionClient,
	sectionId: string,
	groups: MockGroup[],
	assetId: (name: string | null) => string | undefined,
) {
	const questionGroups: Prisma.QuestionGroupCreateManyInput[] = [];
	const questions: Prisma.QuestionCreateManyInput[] = [];
	const choices: Prisma.ChoiceCreateManyInput[] = [];
	for (const { audio, questions: items } of groups) {
		const passage = items[0]?.passage;
		const groupId = audio || passage ? randomUUID() : undefined;
		if (groupId) {
			questionGroups.push({
				id: groupId,
				sectionId,
				passage,
				audioId: assetId(audio?.file ?? null),
				audioStartMs: audio ? 0 : undefined,
				audioEndMs: audio?.durationMs,
				audioMaxPlays: audio ? 1 : undefined,
			});
		}
		for (const question of items) {
			const questionId = randomUUID();
			questions.push({
				id: questionId,
				sectionId,
				groupId,
				kind: 'CHOICE',
				prompt: question.prompt,
				sortOrder: question.number,
				points: question.points,
				imageId: assetId(question.image),
				explanation: question.explanation,
			});
			choices.push(
				...question.choices.map((choice, index) => ({
					questionId,
					text: choice.text || null,
					imageId: assetId(choice.image),
					sortOrder: index + 1,
					correct: question.answer === index + 1,
				})),
			);
		}
	}
	await tx.questionGroup.createMany({ data: questionGroups });
	await tx.question.createMany({ data: questions });
	await tx.choice.createMany({ data: choices });
}

async function main() {
	const source = process.argv[2];
	const nickname = process.argv[3]?.trim().normalize('NFKC').toLocaleLowerCase('en-US');
	requireData(
		source && nickname,
		'Usage: npm run mock:import -- <manifest.json> <admin nickname>',
	);
	const path = resolve(source);
	const directory = resolve(dirname(path), 'media');
	const { variants } = JSON.parse(await readFile(path, 'utf8')) as {
		variants: MockVariant[];
	};
	const { assets: names, writingRounds, longestPlaybackMs } = validate(variants);
	const listeningSeconds = Math.max(
		mcqSections.listening.durationSeconds,
		Math.ceil(longestPlaybackMs / 1000) + 30,
	);
	const durationSeconds =
		listeningSeconds + writing.durationSeconds + mcqSections.reading.durationSeconds;
	const target = examMediaStorage(directory, 'mock-topik/');
	const files: AssetFile[] = [];
	for (const name of names.keys()) files.push(await inspectAsset(directory, name));

	const [owner, family, menu] = await Promise.all([
		db.member.findFirst({
			where: { memberNickKey: nickname, role: 'ADMIN' },
			select: { id: true },
		}),
		db.examFamily.findUnique({
			where: { languageCode_key: { languageCode: 'ko', key: 'TOPIK' } },
		}),
		db.menu.findFirst({ where: { systemKey: 'MOCK_EXAM', published: true } }),
	]);
	requireData(
		owner && family && menu,
		'An administrator, the TOPIK family and the published Mock Exam menu are required',
	);
	await officialWriting(db, writingRounds);
	await target.upload(files);

	const created = await db.$transaction(
		async (tx) => {
			const existing = await tx.exam.findUnique({
				where: { slug },
				select: {
					kind: true,
					languageCode: true,
					versions: {
						where: { number: 1, publishedAt: { not: null } },
						select: {
							title: true,
							variants: {
								orderBy: { sortOrder: 'asc' },
								select: {
									label: true,
									sections: {
										orderBy: { sortOrder: 'asc' },
										select: { kind: true, _count: { select: { questions: true } } },
									},
								},
							},
						},
					},
				},
			});
			if (existing) {
				const original = existing.versions[0];
				requireData(
					existing.kind === 'MOCK' &&
						existing.languageCode === 'ko' &&
						original?.title === title &&
						original.variants.length === variants.length &&
						original.variants.every(
							(variant, index) =>
								variant.label === label(index) &&
								variant.sections
									.map(({ kind, _count }) => kind + ':' + _count.questions)
									.join() === 'LISTENING:50,WRITING:4,READING:50',
						),
					'A different exam already uses the slug ' + slug,
				);
				return false;
			}

			const writingQuestions = await officialWriting(tx, writingRounds);
			const now = new Date();
			await tx.mediaAsset.createMany({
				data: files.map((file) => ({
					key: target.prefix + file.name,
					ownerId: owner.id,
					contentType: file.contentType,
					sizeBytes: file.sizeBytes,
					durationMs: names.get(file.name),
					uploadedAt: now,
				})),
				skipDuplicates: true,
			});
			const assets = await tx.mediaAsset.findMany({
				where: {
					key: { in: files.map(({ name }) => target.prefix + name) },
					uploadedAt: { not: null },
				},
				select: { key: true, id: true },
			});
			requireData(assets.length === files.length, 'Some media records are unavailable');
			const ids = new Map(assets.map(({ key, id }) => [key, id]));
			const assetId = (name: string | null) =>
				name === null ? undefined : ids.get(target.prefix + name);

			const exam = await tx.exam.create({
				data: {
					slug,
					familyId: family.id,
					kind: 'MOCK',
					languageCode: 'ko',
					menus: { create: { menuId: menu.id } },
				},
			});
			const version = await tx.examVersion.create({
				data: {
					examId: exam.id,
					number: 1,
					title,
					description: '듣기 · 쓰기 · 읽기 모의고사 10회분. 일부 정답은 검토 중입니다.',
					durationSeconds,
					publishedAt: now,
				},
			});
			for (const [index, sourceVariant] of variants.entries()) {
				const variant = await tx.examVariant.create({
					data: { versionId: version.id, label: label(index), sortOrder: index },
				});
				for (const name of sectionNames) {
					const section = await tx.examSection.create({
						data: {
							...mcqSections[name],
							variantId: variant.id,
							durationSeconds:
								name === 'listening'
									? listeningSeconds
									: mcqSections[name].durationSeconds,
						},
					});
					await setQuestions(tx, section.id, sourceVariant[name].groups, assetId);
				}
				const section = await tx.examSection.create({
					data: { ...writing, variantId: variant.id },
				});
				const questions = writingQuestions[index];
				requireData(questions, 'Official writing is missing for ' + label(index));
				await tx.question.createMany({
					data: questions.map((question) => ({
						...question,
						sectionId: section.id,
					})),
				});
			}
			await tx.exam.update({
				where: { id: exam.id },
				data: { currentVersionId: version.id },
			});
			return true;
		},
		{ timeout: 30000 },
	);
	console.log(
		slug,
		created ? 'published' : 'already imported',
		'|',
		variants.length,
		'variants and',
		files.length,
		'media objects',
	);
}

main()
	.catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : 'Mock import failed');
		process.exitCode = 1;
	})
	.finally(() => db.$disconnect());
