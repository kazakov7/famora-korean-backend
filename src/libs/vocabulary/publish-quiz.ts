import type { Prisma } from '@prisma/client';
import { vocabularyChoiceRows, type VocabularyQuestion } from './quiz-questions';

export async function publishVocabularyQuiz(
	tx: Prisma.TransactionClient,
	data: Pick<Prisma.ExamCreateInput, 'slug' | 'menus' | 'dailyPracticeDate'>,
	title: string,
	questions: VocabularyQuestion[],
	publishedAt = new Date(),
) {
	const exam = await tx.exam.create({
		data: { ...data, languageCode: 'ko', kind: 'VOCABULARY' },
		select: { id: true },
	});
	const durationSeconds = questions.length * 30;
	const version = await tx.examVersion.create({
		data: {
			examId: exam.id,
			number: 1,
			title,
			durationSeconds,
			publishedAt,
			variants: {
				create: {
					label: title,
					sortOrder: 0,
					sections: {
						create: {
							kind: 'VOCABULARY',
							sortOrder: 0,
							durationSeconds,
							questions: {
								create: questions.map((word, index) => ({
									kind: 'CHOICE',
									prompt: word.term,
									points: 1,
									sortOrder: index,
									choices: { create: vocabularyChoiceRows(word) },
								})),
							},
						},
					},
				},
			},
		},
		select: { id: true },
	});
	await tx.exam.update({
		where: { id: exam.id },
		data: { currentVersionId: version.id },
	});
}
