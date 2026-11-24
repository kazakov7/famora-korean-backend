import { Injectable } from '@nestjs/common';
import type {
	AttemptAnswer,
	Choice,
	Prisma,
	Question,
	SectionKind,
} from '@prisma/client';

interface ScoreSection {
	kind: SectionKind;
	questions: (Pick<Question, 'id' | 'kind' | 'points'> & {
		choices: Pick<Choice, 'id' | 'correct'>[];
	})[];
}

@Injectable()
export class ScoringService {
	async award(
		tx: Prisma.TransactionClient,
		memberId: string,
		examId: string,
		scope: string,
		amount: number,
	) {
		const result = await tx.pointEvent.createMany({
			data: { memberId, examId, scope, amount },
			skipDuplicates: true,
		});
		if (result.count && amount) {
			await tx.member.update({
				where: { id: memberId },
				data: { memberPoints: { increment: amount } },
			});
		}
		return result.count ? amount : 0;
	}

	async finish(
		tx: Prisma.TransactionClient,
		attempt: { id: string; memberId: string; examId: string },
		sections: ScoreSection[],
		answers: AttemptAnswer[],
	) {
		const selected = new Map(answers.map((answer) => [answer.questionId, answer]));
		for (const section of sections) {
			const totals = {
				correct: 0,
				wrong: 0,
				unanswered: 0,
				ungraded: 0,
				score: 0,
				maxScore: 0,
			};
			for (const question of section.questions) {
				const answer = selected.get(question.id);
				if (question.kind === 'TEXT') {
					if (answer?.text?.trim()) totals.ungraded += 1;
					else totals.unanswered += 1;
					continue;
				}
				totals.maxScore += question.points;
				if (!answer?.choiceId) totals.unanswered += 1;
				else if (
					question.choices.some(
						(choice) => choice.id === answer.choiceId && choice.correct,
					)
				) {
					totals.correct += 1;
					totals.score += question.points;
				} else {
					totals.wrong += 1;
				}
			}
			const points = await this.award(
				tx,
				attempt.memberId,
				attempt.examId,
				section.kind,
				totals.correct * 4,
			);
			await tx.attemptSectionResult.create({
				data: { attemptId: attempt.id, section: section.kind, ...totals, points },
			});
		}
	}
}
