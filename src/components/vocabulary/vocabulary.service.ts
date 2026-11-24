import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { PageInput } from '../../libs/dto/common/page.input';
import type {
	SaveVocabularyInput,
	UpdateVocabularyInput,
} from '../../libs/dto/vocabulary/vocabulary.input';
import { translationKey } from '../../libs/vocabulary/quiz-choices';
import { vocabularyMenuPaths } from '../../libs/vocabulary/menu-paths';
import { CatalogService } from '../catalog/catalog.service';

const publishedUnit = {
	kind: 'VOCABULARY',
	language: { active: true },
	archivedAt: null,
	currentVersionId: { not: null },
} satisfies Prisma.ExamWhereInput;

const unitWord = {
	id: true,
	prompt: true,
	choices: { where: { correct: true }, select: { text: true } },
} satisfies Prisma.QuestionSelect;

const sources = {
	sources: {
		orderBy: { createdAt: 'desc' },
		include: {
			question: { select: { section: { select: { kind: true } } } },
			exam: { select: { slug: true } },
			attempt: { select: { version: { select: { title: true } } } },
		},
	},
} satisfies Prisma.VocabularyEntryInclude;

type WordRow = Prisma.VocabularyEntryGetPayload<{ include: typeof sources }>;

@Injectable()
export class VocabularyService {
	constructor(
		private readonly db: PrismaService,
		private readonly catalog: CatalogService,
	) {}

	async unit(slug: string) {
		const paths = vocabularyMenuPaths(await this.catalog.navigation());
		const menuId = { in: [...paths.keys()] };
		const exam = await this.db.exam.findFirst({
			where: { ...publishedUnit, slug, menus: { some: { menuId } } },
			select: {
				languageCode: true,
				menus: {
					where: { menuId },
					orderBy: { menu: { slug: 'asc' } },
					take: 1,
					select: { menuId: true },
				},
				currentVersion: {
					select: {
						variants: {
							select: {
								sections: {
									where: { kind: 'VOCABULARY' },
									select: {
										questions: { orderBy: { sortOrder: 'asc' }, select: unitWord },
									},
								},
							},
						},
					},
				},
			},
		});
		const words = exam?.currentVersion?.variants[0]?.sections[0]?.questions;
		const menu = exam?.menus[0];
		const collectionPath = menu && paths.get(menu.menuId);
		const collectionSlug = collectionPath?.at(-1);
		if (!exam || !collectionPath || !collectionSlug || !words)
			throw new NotFoundException('Vocabulary unit not found');
		return {
			languageCode: exam.languageCode,
			collectionSlug,
			collectionPath,
			words: words.map((word) => this.unitTranslation(word)),
		};
	}

	saveUnitWord(memberId: string, id: string) {
		return this.db.serial(async (tx) => {
			const paths = vocabularyMenuPaths(await this.catalog.navigation(tx));
			const word = await tx.question.findFirst({
				where: {
					id,
					section: {
						kind: 'VOCABULARY',
						variant: {
							version: {
								currentFor: {
									...publishedUnit,
									menus: { some: { menuId: { in: [...paths.keys()] } } },
								},
							},
						},
					},
				},
				select: {
					...unitWord,
					section: {
						select: {
							variant: {
								select: {
									version: { select: { exam: { select: { languageCode: true } } } },
								},
							},
						},
					},
				},
			});
			if (!word) throw new NotFoundException('Vocabulary word not found');
			const { term, translation } = this.unitTranslation(word);
			const key = {
				memberId,
				languageCode: word.section.variant.version.exam.languageCode,
				termKey: translationKey(term),
			};
			const entry = await tx.vocabularyEntry.upsert({
				where: { memberId_languageCode_termKey: key },
				create: { ...key, term, translation },
				update: {},
			});
			await tx.vocabularyEntry.updateMany({
				where: { id: entry.id, translation: null },
				data: { translation },
			});
			return this.show(
				await tx.vocabularyEntry.findUniqueOrThrow({
					where: { id: entry.id },
					include: sources,
				}),
			);
		});
	}

	private unitTranslation(word: Prisma.QuestionGetPayload<{ select: typeof unitWord }>) {
		const translation = word.choices[0]?.text;
		if (!translation) throw new NotFoundException('Vocabulary translation not found');
		return { id: word.id, term: word.prompt, translation };
	}

	async list(memberId: string, page: PageInput) {
		const where = { memberId };
		const [items, total] = await this.db.$transaction([
			this.db.vocabularyEntry.findMany({
				where,
				skip: page.offset,
				take: page.limit,
				orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
				include: sources,
			}),
			this.db.vocabularyEntry.count({ where }),
		]);
		return { list: items.map((word) => this.show(word)), total };
	}

	save(memberId: string, input: SaveVocabularyInput) {
		const term = input.term.trim().replace(/\s+/gu, ' ');
		const termKey = term.normalize('NFKC').toLocaleLowerCase('en-US');
		if (!term) throw new BadRequestException('Enter a word');
		return this.db.serial(async (tx) => {
			const attempt = await tx.attempt.findFirst({
				where: { id: input.attemptId, memberId },
				include: { exam: { select: { languageCode: true } } },
			});
			if (!attempt) throw new NotFoundException('Attempt not found');
			const question = await tx.question.findFirst({
				where: {
					id: input.questionId,
					section: {
						variantId: attempt.variantId,
						kind:
							attempt.mode === 'FULL'
								? undefined
								: (attempt.mode as 'LISTENING' | 'READING' | 'WRITING'),
					},
				},
				select: { id: true },
			});
			if (!question) throw new NotFoundException('Question not found in this attempt');
			const key = { memberId, languageCode: attempt.exam.languageCode, termKey };
			const entry = await tx.vocabularyEntry.upsert({
				where: { memberId_languageCode_termKey: key },
				create: { ...key, term },
				update: {},
			});
			await tx.vocabularySource.createMany({
				data: {
					entryId: entry.id,
					attemptId: attempt.id,
					examId: attempt.examId,
					questionId: question.id,
				},
				skipDuplicates: true,
			});
			return this.show(
				await tx.vocabularyEntry.findUniqueOrThrow({
					where: { id: entry.id },
					include: sources,
				}),
			);
		});
	}

	async update(memberId: string, input: UpdateVocabularyInput) {
		const result = await this.db.vocabularyEntry.updateMany({
			where: { id: input.id, memberId },
			data: { translation: input.translation, note: input.note },
		});
		if (!result.count) throw new NotFoundException('Vocabulary word not found');
		return this.show(
			await this.db.vocabularyEntry.findUniqueOrThrow({
				where: { id: input.id },
				include: sources,
			}),
		);
	}

	private show(row: WordRow) {
		const { sources, ...word } = row;
		return {
			...word,
			sources: sources.map((source) => ({
				attemptId: source.attemptId,
				questionId: source.questionId,
				examId: source.examId,
				examSlug: source.exam.slug,
				examTitle: source.attempt.version.title,
				section: source.question.section.kind,
				createdAt: source.createdAt,
			})),
		};
	}
}
