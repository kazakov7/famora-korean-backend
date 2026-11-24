import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { AttemptStatus, Prisma, SectionKind, SubmissionReason } from '@prisma/client';
import type { Attempt } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { AttemptMode } from '../../libs/dto/attempt/attempt.input';
import type {
	AnswerInput,
	MoveAttemptInput,
	SaveAudioInput,
	StartAttemptInput,
	StartAudioInput,
} from '../../libs/dto/attempt/attempt.input';
import type {
	ReviewQuestion,
	AttemptResult,
	AttemptSummary,
	AttemptView,
} from '../../libs/dto/attempt/attempt';
import type { PageInput } from '../../libs/dto/common/page.input';
import { availableExamDay } from '../../libs/vocabulary/practice-date';
import { quizChoices } from '../../libs/vocabulary/quiz-choices';
import { MediaService } from '../media/media.service';
import { ScoringService } from '../scoring/scoring.service';

const summaryInclude = {
	exam: { select: { slug: true, dailyPracticeDate: true } },
	version: { select: { title: true } },
	variant: { select: { label: true } },
	sectionResults: true,
} satisfies Prisma.AttemptInclude;

const viewInclude = {
	...summaryInclude,
	variant: {
		include: {
			sections: {
				orderBy: { sortOrder: 'asc' },
				include: {
					groups: { include: { image: true, audio: true } },
					questions: {
						orderBy: { sortOrder: 'asc' },
						include: {
							image: true,
							sampleAnswerImage: true,
							choices: { orderBy: { sortOrder: 'asc' }, include: { image: true } },
						},
					},
				},
			},
		},
	},
	answers: true,
	audioStates: true,
} satisfies Prisma.AttemptInclude;

type SummaryRow = Prisma.AttemptGetPayload<{ include: typeof summaryInclude }>;
type ViewRow = Prisma.AttemptGetPayload<{ include: typeof viewInclude }>;

@Injectable()
export class AttemptService {
	constructor(
		private readonly db: PrismaService,
		private readonly scoring: ScoringService,
		private readonly media: MediaService,
	) {}

	async recordOpen(memberId: string, examId: string) {
		return this.forMember(memberId, async (tx) => {
			const exam = await tx.exam.findFirst({
				where: {
					...availableExamDay(),
					id: examId,
					archivedAt: null,
					currentVersionId: { not: null },
					language: { active: true },
				},
				select: { id: true },
			});
			if (!exam) throw new NotFoundException('Exam not found');
			return this.scoring.award(tx, memberId, examId, 'OPEN', 1);
		});
	}

	async start(memberId: string, input: StartAttemptInput) {
		const id = await this.forMember(memberId, async (tx) => {
			const { examId, mode } = input;
			const now = new Date();
			const existing = await tx.attempt.findFirst({
				where: { memberId, examId, mode, status: { in: ['IN_PROGRESS', 'PAUSED'] } },
				orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
			});
			if (existing) {
				const current = await this.expire(tx, existing, now);
				if (current.status !== AttemptStatus.COMPLETED) return existing.id;
			}
			const exam = await tx.exam.findFirst({
				where: {
					...availableExamDay(now),
					id: examId,
					archivedAt: null,
					language: { active: true },
				},
				include: {
					currentVersion: {
						include: {
							variants: {
								orderBy: { sortOrder: 'asc' },
								include: {
									sections: {
										orderBy: { sortOrder: 'asc' },
										include: {
											questions: {
												select: { id: true },
												orderBy: { sortOrder: 'asc' },
												take: 1,
											},
										},
									},
								},
							},
						},
					},
				},
			});
			const version = exam?.currentVersion;
			if (!version) throw new NotFoundException('Exam not found');
			const options = version.variants.filter(
				(variant) =>
					mode === AttemptMode.FULL ||
					variant.sections.some((section) => section.kind === mode.toString()),
			);
			if (!options.length) throw new BadRequestException('That exam mode is unavailable');
			const previous = await tx.attempt.findFirst({
				where: { memberId, examId, mode },
				orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
				include: { variant: { select: { sortOrder: true } } },
			});
			const variant =
				options.find(
					({ sortOrder }) => previous && sortOrder > previous.variant.sortOrder,
				) ?? options[0];
			if (!variant) throw new BadRequestException('No playable variant');
			const firstSection =
				mode === AttemptMode.FULL
					? variant.sections[0]
					: variant.sections.find(({ kind }) => kind === mode.toString());
			if (!firstSection) throw new BadRequestException('No playable section');
			const durationMs =
				(mode === AttemptMode.FULL
					? version.durationSeconds
					: firstSection.durationSeconds) * 1000;
			await this.scoring.award(tx, memberId, examId, 'OPEN', 1);
			const attempt = await tx.attempt.create({
				data: {
					memberId,
					examId,
					versionId: version.id,
					variantId: variant.id,
					mode,
					durationMs,
					remainingMs: durationMs,
					deadlineAt: new Date(now.getTime() + durationMs),
					currentQuestionId: firstSection.questions[0]?.id,
				},
				select: { id: true },
			});
			return attempt.id;
		});
		return this.get(memberId, id);
	}

	async get(memberId: string, id: string): Promise<AttemptView> {
		const row = await this.load(memberId, id);
		return this.view(row);
	}

	async result(memberId: string, id: string): Promise<AttemptResult> {
		const row = await this.load(memberId, id);
		if (row.status !== AttemptStatus.COMPLETED)
			throw new ConflictException('Submit the test before viewing the result');
		const view = await this.view(row);
		const visible = new Map(
			view.sections.flatMap((section) =>
				section.questions.map((question) => [question.id, question] as const),
			),
		);
		const review = await Promise.all(
			this.sections(row).flatMap((section) =>
				section.questions.map(async (question): Promise<ReviewQuestion | null> => {
					const player = visible.get(question.id);
					if (!player) return null;
					const correctChoiceId = question.choices.find(({ correct }) => correct)?.id;
					return {
						...player,
						section: section.kind,
						correctChoiceId,
						explanation: question.explanation,
						sampleAnswer: question.sampleAnswer,
						sampleAnswerImageUrl: await this.media.url(question.sampleAnswerImage),
						earnedScore:
							question.kind === 'TEXT'
								? null
								: correctChoiceId && player.selectedChoiceId === correctChoiceId
									? question.points
									: 0,
					};
				}),
			),
		);
		return {
			...view,
			sectionResults: row.sectionResults,
			review: review.filter((item) => item !== null),
		};
	}

	async pending(memberId: string) {
		const rows = await this.db.attempt.findMany({
			where: { memberId, status: AttemptStatus.PAUSED },
			include: summaryInclude,
			orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
		});
		return rows.map((row) => this.summary(row));
	}

	async history(memberId: string, page: PageInput) {
		const where = { memberId, status: AttemptStatus.COMPLETED };
		const [rows, total, grouped, member] = await this.db.$transaction([
			this.db.attempt.findMany({
				where,
				skip: page.offset,
				take: page.limit,
				orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
				include: summaryInclude,
			}),
			this.db.attempt.count({ where }),
			this.db.$queryRaw<{ count: number }[]>`
				SELECT COUNT(DISTINCT ("examId", "mode"))::int AS count
				FROM "attempts" WHERE "memberId" = ${memberId}::uuid AND "status" = 'COMPLETED'
			`,
			this.db.member.findUniqueOrThrow({
				where: { id: memberId },
				select: { memberPoints: true },
			}),
		]);
		return {
			list: rows.map((row) => this.summary(row)),
			total,
			distinctCompletedTests: grouped[0]?.count ?? 0,
			memberPoints: member.memberPoints,
		};
	}

	move(memberId: string, input: MoveAttemptInput) {
		return this.activeEdit(memberId, input.attemptId, async (tx, attempt) => {
			await this.requireQuestion(tx, attempt, input.questionId);
			await tx.attempt.update({
				where: { id: attempt.id },
				data: { currentQuestionId: input.questionId },
			});
			return true;
		});
	}

	saveAnswer(memberId: string, input: AnswerInput) {
		return this.activeEdit(memberId, input.attemptId, async (tx, attempt) => {
			const question = await this.requireQuestion(tx, attempt, input.questionId);
			const choiceId = input.choiceId ?? null;
			const text = input.text?.trim() ? input.text : null;
			if (
				(question.kind === 'CHOICE' && text) ||
				(question.kind === 'TEXT' && choiceId)
			) {
				throw new BadRequestException('Use the answer format for this question');
			}
			if (
				choiceId &&
				!(await tx.choice.findFirst({
					where: { id: choiceId, questionId: question.id },
					select: { id: true },
				}))
			) {
				throw new BadRequestException('Select a choice from this question');
			}
			if (choiceId && question.section.kind === SectionKind.VOCABULARY) {
				const choices = await tx.choice.findMany({
					where: { questionId: question.id },
					select: { id: true, correct: true },
				});
				if (
					!quizChoices(attempt.id, question.section.kind, choices).some(
						(choice) => choice.id === choiceId,
					)
				)
					throw new BadRequestException('Select one of the displayed choices');
			}
			const key = { attemptId: attempt.id, questionId: question.id };
			if (choiceId || text) {
				await tx.attemptAnswer.upsert({
					where: { attemptId_questionId: key },
					create: { ...key, choiceId, text },
					update: { choiceId, text },
				});
			} else {
				await tx.attemptAnswer.deleteMany({ where: key });
			}
			return true;
		});
	}

	async pause(memberId: string, id: string) {
		await this.forMember(memberId, async (tx) => {
			const now = new Date();
			const attempt = await this.expire(tx, await this.own(tx, memberId, id), now);
			if (attempt.status !== AttemptStatus.IN_PROGRESS) return;
			await tx.attempt.update({
				where: { id },
				data: {
					status: AttemptStatus.PAUSED,
					remainingMs: this.remaining(attempt, now),
					deadlineAt: null,
				},
			});
		});
		return this.get(memberId, id);
	}

	async resume(memberId: string, id: string) {
		await this.forMember(memberId, async (tx) => {
			const attempt = await this.own(tx, memberId, id);
			if (attempt.status !== AttemptStatus.PAUSED) return;
			await tx.attempt.update({
				where: { id },
				data: {
					status: AttemptStatus.IN_PROGRESS,
					deadlineAt: new Date(Date.now() + attempt.remainingMs),
				},
			});
		});
		return this.get(memberId, id);
	}

	async submit(memberId: string, id: string) {
		await this.forMember(memberId, async (tx) => {
			const now = new Date();
			const attempt = await this.expire(tx, await this.own(tx, memberId, id), now);
			if (attempt.status === AttemptStatus.COMPLETED) return;
			await this.finish(tx, attempt, now, SubmissionReason.MANUAL);
		});
		return this.result(memberId, id);
	}

	playAudio(memberId: string, input: StartAudioInput) {
		return this.activeEdit(memberId, input.attemptId, async (tx, attempt) => {
			const group = await this.audioGroup(tx, attempt, input.groupId);
			const key = { attemptId: attempt.id, groupId: group.id };
			const previous = await tx.attemptAudioState.findUnique({
				where: { attemptId_groupId: key },
			});
			const maxPlays = group.audioMaxPlays ?? group.section.audioMaxPlays;
			const startMs = group.audioStartMs ?? 0;
			const endMs = group.audioEndMs ?? group.audio?.durationMs ?? null;
			const url = await this.media.url(group.audio);
			if (!url) throw new NotFoundException('Audio not found');
			if (!input.replay && previous?.playing && previous.playbackId) {
				return {
					url,
					playbackId: previous.playbackId,
					startMs,
					endMs,
					positionMs: previous.positionMs,
					plays: previous.plays,
					maxPlays,
				};
			}
			const plays = (previous?.plays ?? 0) + 1;
			if (maxPlays != null && plays > maxPlays)
				throw new ConflictException('Playback limit reached');
			const playbackId = randomUUID();
			const fields = { plays, playbackId, playing: true, positionMs: startMs };
			await tx.attemptAudioState.upsert({
				where: { attemptId_groupId: key },
				create: { ...key, ...fields },
				update: fields,
			});
			return { url, playbackId, startMs, endMs, positionMs: startMs, plays, maxPlays };
		});
	}

	saveAudio(memberId: string, input: SaveAudioInput) {
		return this.activeEdit(memberId, input.attemptId, async (tx, attempt) => {
			const group = await this.audioGroup(tx, attempt, input.groupId);
			const min = group.audioStartMs ?? 0;
			const end = group.audioEndMs ?? group.audio?.durationMs;
			if (input.positionMs < min || (end != null && input.positionMs > end))
				throw new BadRequestException('Playback position is outside this audio segment');
			const { count } = await tx.attemptAudioState.updateMany({
				where: {
					attemptId: attempt.id,
					groupId: group.id,
					playbackId: input.playbackId,
					playing: true,
				},
				data: { positionMs: input.positionMs, playing: !input.finished },
			});
			return Boolean(count);
		});
	}

	async expireDue() {
		const due = await this.db.attempt.findMany({
			where: { status: AttemptStatus.IN_PROGRESS, deadlineAt: { lte: new Date() } },
			select: { id: true, memberId: true },
			take: 50,
			orderBy: { deadlineAt: 'asc' },
		});
		for (const { id, memberId } of due) {
			await this.forMember(memberId, async (tx) => {
				const current = await tx.attempt.findUnique({ where: { id } });
				if (current) await this.expire(tx, current, new Date());
			});
		}
	}

	private async load(memberId: string, id: string) {
		return this.forMember(memberId, async (tx) => {
			await this.expire(tx, await this.own(tx, memberId, id), new Date());
			return tx.attempt.findUniqueOrThrow({ where: { id }, include: viewInclude });
		});
	}

	private forMember<T>(
		memberId: string,
		work: (tx: Prisma.TransactionClient) => Promise<T>,
	) {
		return this.db.$transaction(
			async (tx) => {
				// Attempts and point awards for one member share this lock.
				await tx.$queryRaw`
					SELECT "id" FROM "members" WHERE "id" = ${memberId}::uuid FOR NO KEY UPDATE
				`;
				return work(tx);
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 },
		);
	}

	private async own(tx: Prisma.TransactionClient, memberId: string, id: string) {
		const attempt = await tx.attempt.findFirst({ where: { id, memberId } });
		if (!attempt) throw new NotFoundException('Attempt not found');
		return attempt;
	}

	private async activeEdit<T>(
		memberId: string,
		id: string,
		work: (tx: Prisma.TransactionClient, attempt: Attempt) => Promise<T>,
	) {
		const result = await this.forMember(memberId, async (tx) => {
			const attempt = await this.expire(tx, await this.own(tx, memberId, id), new Date());
			if (attempt.status !== AttemptStatus.IN_PROGRESS) return { active: false } as const;
			return { active: true, value: await work(tx, attempt) } as const;
		});
		if (!result.active) throw new ConflictException('The attempt is not active');
		return result.value;
	}

	private async expire(tx: Prisma.TransactionClient, attempt: Attempt, now: Date) {
		if (
			attempt.status === AttemptStatus.IN_PROGRESS &&
			attempt.deadlineAt &&
			attempt.deadlineAt <= now
		) {
			return this.finish(tx, attempt, attempt.deadlineAt, SubmissionReason.TIMEOUT);
		}
		return attempt;
	}

	private async finish(
		tx: Prisma.TransactionClient,
		attempt: Attempt,
		now: Date,
		reason: SubmissionReason,
	) {
		const finished = await tx.attempt.update({
			where: { id: attempt.id },
			data: {
				status: AttemptStatus.COMPLETED,
				reason,
				completedAt: now,
				deadlineAt: null,
				remainingMs:
					reason === SubmissionReason.TIMEOUT ? 0 : this.remaining(attempt, now),
			},
		});
		const sections = await tx.examSection.findMany({
			where: this.sectionFilter(attempt),
			orderBy: { sortOrder: 'asc' },
			include: { questions: { include: { choices: true } } },
		});
		const answers = await tx.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
		await this.scoring.finish(tx, attempt, sections, answers);
		return finished;
	}

	private remaining(attempt: Attempt, now: Date) {
		if (attempt.status === AttemptStatus.IN_PROGRESS && attempt.deadlineAt) {
			return Math.max(0, attempt.deadlineAt.getTime() - now.getTime());
		}
		return attempt.remainingMs;
	}

	private sectionFilter(attempt: Attempt): Prisma.ExamSectionWhereInput {
		return {
			variantId: attempt.variantId,
			kind: attempt.mode === AttemptMode.FULL ? undefined : (attempt.mode as SectionKind),
		};
	}

	private async requireQuestion(
		tx: Prisma.TransactionClient,
		attempt: Attempt,
		id: string,
	) {
		const question = await tx.question.findFirst({
			where: { id, section: this.sectionFilter(attempt) },
			select: { id: true, kind: true, section: { select: { kind: true } } },
		});
		if (!question) throw new NotFoundException('Question not found in this attempt');
		return question;
	}

	private async audioGroup(tx: Prisma.TransactionClient, attempt: Attempt, id: string) {
		const group = await tx.questionGroup.findFirst({
			where: { id, audioId: { not: null }, section: this.sectionFilter(attempt) },
			include: { audio: true, section: { select: { audioMaxPlays: true } } },
		});
		if (!group) throw new NotFoundException('Audio group not found in this attempt');
		return group;
	}

	private summary(row: SummaryRow): AttemptSummary {
		const serverNow = new Date();
		const remainingMs = this.remaining(row, serverNow);
		const totals = row.sectionResults.reduce(
			(result, section) => ({
				score: result.score + section.score,
				maxScore: result.maxScore + section.maxScore,
				points: result.points + section.points,
			}),
			{ score: 0, maxScore: 0, points: 0 },
		);
		return {
			id: row.id,
			examId: row.examId,
			examSlug: row.exam.slug,
			dailyPractice: row.exam.dailyPracticeDate !== null,
			title: row.version.title,
			versionId: row.versionId,
			variantId: row.variantId,
			variantLabel: row.variant.label,
			mode: row.mode as AttemptMode,
			status: row.status,
			deadlineAt: row.deadlineAt,
			serverNow,
			remainingMs,
			elapsedMs: Math.max(0, row.durationMs - remainingMs),
			createdAt: row.createdAt,
			completedAt: row.completedAt,
			reason: row.reason,
			...totals,
		};
	}

	private sections(row: ViewRow) {
		return row.variant.sections.filter(
			(section) => row.mode === AttemptMode.FULL || section.kind === row.mode,
		);
	}

	private async view(row: ViewRow): Promise<AttemptView> {
		const answers = new Map(row.answers.map((answer) => [answer.questionId, answer]));
		const audioStates = new Map(row.audioStates.map((audio) => [audio.groupId, audio]));
		const sections = await Promise.all(
			this.sections(row).map(async (section) => ({
				kind: section.kind,
				title: section.title,
				instructions: section.instructions,
				groups: await Promise.all(
					section.groups.map(async (group) => {
						const audio = audioStates.get(group.id);
						return {
							id: group.id,
							passage: group.passage,
							imageUrl: await this.media.url(group.image),
							hasAudio: Boolean(group.audio),
							audioMaxPlays: group.audioMaxPlays ?? section.audioMaxPlays,
							audioUrl:
								row.status === AttemptStatus.COMPLETED
									? await this.media.url(group.audio)
									: null,
							audioStartMs: group.audioStartMs,
							audioEndMs: group.audioEndMs,
							plays: audio?.plays ?? 0,
							positionMs: audio?.positionMs ?? group.audioStartMs ?? 0,
						};
					}),
				),
				questions: await Promise.all(
					section.questions.map(async (question) => {
						const answer = answers.get(question.id);
						return {
							id: question.id,
							kind: question.kind,
							prompt: question.prompt,
							groupId: question.groupId,
							imageUrl: await this.media.url(question.image),
							selectedChoiceId: answer?.choiceId,
							answerText: answer?.text,
							choices: await Promise.all(
								quizChoices(row.id, section.kind, question.choices).map(
									async (choice) => ({
										id: choice.id,
										text: choice.text,
										imageUrl: await this.media.url(choice.image),
									}),
								),
							),
						};
					}),
				),
			})),
		);
		return { ...this.summary(row), currentQuestionId: row.currentQuestionId, sections };
	}
}
