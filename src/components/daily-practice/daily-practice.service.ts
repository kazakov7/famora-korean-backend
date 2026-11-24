import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { vocabularyMenuPaths } from '../../libs/vocabulary/menu-paths';
import {
	DAILY_PRACTICE_TIME_ZONE,
	practiceDate,
} from '../../libs/vocabulary/practice-date';
import { publishVocabularyQuiz } from '../../libs/vocabulary/publish-quiz';
import {
	vocabularyQuizBuilder,
	vocabularyTermKey,
	type VocabularyWord,
} from '../../libs/vocabulary/quiz-questions';
import { CatalogService } from '../catalog/catalog.service';
import { ExamService } from '../exam/exam.service';

const wordsPerPractice = 15;

@Injectable()
export class DailyPracticeService implements OnApplicationBootstrap {
	private readonly logger = new Logger(DailyPracticeService.name);

	constructor(
		private readonly db: PrismaService,
		private readonly catalog: CatalogService,
		private readonly exams: ExamService,
	) {}

	onApplicationBootstrap() {
		return this.refresh();
	}

	@Cron('0 0 0 * * *', { timeZone: DAILY_PRACTICE_TIME_ZONE, waitForCompletion: true })
	async refresh() {
		try {
			await this.ensure(new Date());
		} catch (error) {
			this.logger.error('Could not publish daily practice', error);
		}
	}

	async today() {
		const now = new Date();
		const practice = await this.ensure(now);
		if (!practice || practice.archivedAt) return null;
		const date = practiceDate(now);
		return {
			date: date.toISOString().slice(0, 10),
			questionCount: wordsPerPractice,
			exam: await this.exams.overview(practice.slug, date),
		};
	}

	async ensure(now: Date) {
		const date = practiceDate(now);
		const day = date.toISOString().slice(0, 10);
		const lookup = {
			where: { dailyPracticeDate: date },
			select: { slug: true, archivedAt: true },
		};
		const existing = await this.db.exam.findUnique(lookup);
		if (existing) return existing;

		try {
			return await this.db.$transaction(async (tx) => {
				const menuIds = [
					...vocabularyMenuPaths(await this.catalog.navigation(tx)).keys(),
				];
				const choices = await tx.choice.findMany({
					where: {
						correct: true,
						text: { not: null },
						question: {
							kind: 'CHOICE',
							section: {
								kind: 'VOCABULARY',
								variant: {
									version: {
										publishedAt: { not: null },
										currentFor: {
											kind: 'VOCABULARY',
											languageCode: 'ko',
											language: { active: true },
											dailyPracticeDate: null,
											archivedAt: null,
											menus: { some: { menuId: { in: menuIds } } },
										},
									},
								},
							},
						},
					},
					select: { text: true, question: { select: { prompt: true } } },
				});
				const byTerm = new Map<string, VocabularyWord[]>();
				for (const { text, question } of choices) {
					const term = question.prompt.trim();
					const translation = text?.trim();
					if (!translation || !/\p{Script=Hangul}/u.test(term)) continue;
					const key = vocabularyTermKey(term);
					const rows = byTerm.get(key) ?? [];
					rows.push({ term, translation });
					byTerm.set(key, rows);
				}
				const terms = [...byTerm.values()];
				if (terms.length < wordsPerPractice) return null;
				const words: VocabularyWord[] = [];
				for (let index = 0; index < wordsPerPractice; index += 1) {
					const pick = randomInt(index, terms.length);
					const translations = terms[pick]!;
					terms[pick] = terms[index]!;
					terms[index] = translations;
					words.push(translations[randomInt(translations.length)]!);
				}
				const questions = vocabularyQuizBuilder(terms.flat())(words);
				if (questions.some(({ distractors }) => distractors.length < 3)) return null;
				const slug = `daily-practice-${day}`;
				await publishVocabularyQuiz(
					tx,
					{ slug, dailyPracticeDate: date },
					`Kunlik mashq · ${day}`,
					questions,
					now,
				);
				return { slug, archivedAt: null };
			});
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === 'P2002'
			) {
				const winner = await this.db.exam.findUnique(lookup);
				if (winner) return winner;
			}
			throw error;
		}
	}
}
