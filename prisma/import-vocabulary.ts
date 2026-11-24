import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { vocabularyMenuPaths } from '../src/libs/vocabulary/menu-paths';
import { publishVocabularyQuiz } from '../src/libs/vocabulary/publish-quiz';
import {
	vocabularyChoiceRows,
	vocabularyQuizBuilder,
	type VocabularyQuestion,
} from '../src/libs/vocabulary/quiz-questions';

type Unit = {
	slug: string;
	title: string;
	order: number;
	questions: VocabularyQuestion[];
};
type PublishedWord = {
	prompt: string;
	choices: { text: string | null; correct: boolean; sortOrder: number }[];
};

const db = new PrismaClient();
const wordsPerUnit = 30;

function readText(value: unknown, maxLength: number, label: string) {
	assert(typeof value === 'string', label + ' must be text');
	const text = value.trim().replace(/\s+/gu, ' ');
	assert(text.length > 0 && text.length <= maxLength, 'Invalid ' + label);
	return text;
}

function readCollection(input: unknown) {
	assert(input && typeof input === 'object', 'Expected a collection');
	const source = input as {
		slug?: unknown;
		title?: unknown;
		words?: unknown;
		units?: unknown;
	};
	const slug = readText(source.slug, 60, 'collection slug');
	assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), 'Use a lowercase URL slug');
	const title = readText(source.title, 100, 'collection title');
	const groups: { title: string; words: unknown[] }[] = [];
	if (source.units === undefined) {
		assert(
			Array.isArray(source.words) && source.words.length,
			'The collection has no words',
		);
		for (let offset = 0; offset < source.words.length; offset += wordsPerUnit) {
			const words = source.words.slice(offset, offset + wordsPerUnit);
			groups.push({
				title: title + ' · ' + (offset + 1) + '–' + (offset + words.length),
				words,
			});
		}
	} else {
		assert(source.words === undefined, 'Use either words or units');
		assert(
			Array.isArray(source.units) && source.units.length,
			'The collection has no units',
		);
		for (const [index, row] of source.units.entries()) {
			const label = 'unit ' + (index + 1);
			assert(row && typeof row === 'object', 'Invalid ' + label);
			const unit = row as { title?: unknown; words?: unknown };
			assert(Array.isArray(unit.words) && unit.words.length, 'No words in ' + label);
			groups.push({
				title: readText(unit.title, 100, label + ' title'),
				words: unit.words,
			});
		}
	}

	const parsedGroups = groups.map((group, groupIndex) => ({
		title: group.title,
		words: group.words.map((row, index) => {
			const label = 'row ' + (index + 1) + ' in unit ' + (groupIndex + 1);
			assert(row && typeof row === 'object', 'Invalid ' + label);
			const entry = row as { term?: unknown; translation?: unknown };
			const term = readText(entry.term, 150, 'Korean word at ' + label);
			assert(/\p{Script=Hangul}/u.test(term), 'Korean text is missing at ' + label);
			const translation = readText(entry.translation, 1500, 'translation at ' + label);
			return { term, translation };
		}),
	}));
	const words = parsedGroups.flatMap((group) => group.words);
	const buildQuestions = vocabularyQuizBuilder(words);
	const units: Unit[] = parsedGroups.map(
		({ title: unitTitle, words: chunk }, unitIndex) => {
			const order = unitIndex + 1;
			const questions = buildQuestions(chunk);
			for (const { term, distractors } of questions) {
				assert(distractors.length >= 3, 'Not enough distinct translations for ' + term);
			}
			return {
				slug: 'vocab-' + slug + '-' + order,
				title: unitTitle,
				order,
				questions,
			};
		},
	);
	return { slug: 'vocab-' + slug, title, units, words: words.length };
}

async function main() {
	const [path, menuSlug] = process.argv.slice(2);
	assert(path, 'Usage: npm run vocabulary:import -- <collection.json> [menu-slug]');
	const collection = readCollection(
		JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')),
	);
	const imported = await db.$transaction(
		async (tx) => {
			const root = await tx.menu.findUniqueOrThrow({
				where: { systemKey: 'VOCABULARY' },
			});
			const existing = await tx.menu.findUnique({
				where: { slug: menuSlug ?? collection.slug },
				include: {
					exams: {
						where: { exam: { slug: { in: collection.units.map(({ slug }) => slug) } } },
						orderBy: { sortOrder: 'asc' },
						select: {
							exam: {
								select: {
									slug: true,
									kind: true,
									currentVersion: {
										select: {
											title: true,
											variants: {
												select: {
													sections: {
														select: {
															questions: {
																orderBy: { sortOrder: 'asc' },
																select: {
																	prompt: true,
																	choices: {
																		orderBy: { sortOrder: 'asc' },
																		select: {
																			text: true,
																			correct: true,
																			sortOrder: true,
																		},
																	},
																},
															},
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});
			if (existing) {
				const published = await tx.menu.findMany({ where: { published: true } });
				assert(
					vocabularyMenuPaths(published).has(existing.id),
					'Choose a published menu under Vocabulary',
				);
			} else {
				assert(!menuSlug, 'The requested vocabulary menu does not exist');
			}
			if (existing?.exams.length) {
				assert(
					existing.exams.length === collection.units.length,
					'The collection has only some of its expected units in this menu',
				);
				for (const [index, unit] of collection.units.entries()) {
					const exam: (typeof existing.exams)[number]['exam'] | undefined =
						existing.exams.at(index)?.exam;
					assert(
						exam?.slug === unit.slug && exam.kind === 'VOCABULARY',
						'Collection contains different exams',
					);
					assert.equal(
						exam.currentVersion?.title,
						unit.title,
						'Vocabulary unit title differs',
					);
					const rows: PublishedWord[] | undefined =
						exam.currentVersion?.variants[0]?.sections[0]?.questions;
					assert.deepEqual(
						rows,
						unit.questions.map((word) => ({
							prompt: word.term,
							choices: vocabularyChoiceRows(word),
						})),
						'Collection differs from the published content',
					);
				}
				return false;
			}
			const menu =
				existing ??
				(await tx.menu.create({
					data: {
						parentId: root.id,
						slug: collection.slug,
						name: collection.title,
						published: true,
					},
				}));
			const { _max } = await tx.examMenuLink.aggregate({
				where: { menuId: menu.id },
				_max: { sortOrder: true },
			});
			for (const unit of collection.units) {
				await publishVocabularyQuiz(
					tx,
					{
						slug: unit.slug,
						menus: {
							create: { menuId: menu.id, sortOrder: (_max.sortOrder ?? 0) + unit.order },
						},
					},
					unit.title,
					unit.questions,
				);
			}
			return true;
		},
		{ timeout: 120000 },
	);
	console.log(
		imported ? 'Published' : 'Already imported',
		collection.words,
		'words in',
		collection.units.length,
		'units',
	);
}

main()
	.catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : 'Vocabulary import failed');
		process.exitCode = 1;
	})
	.finally(() => db.$disconnect());
