import { Field, GraphQLISODateTime, ID, Int, ObjectType } from '@nestjs/graphql';
import {
	AttemptStatus,
	QuestionKind,
	SectionKind,
	SubmissionReason,
} from '@prisma/client';
import { AttemptMode } from './attempt.input';

@ObjectType()
export class AttemptChoice {
	@Field(() => ID)
	id!: string;
	@Field(() => String, { nullable: true })
	text?: string | null;
	@Field(() => String, { nullable: true })
	imageUrl?: string | null;
}

@ObjectType()
export class AttemptGroup {
	@Field(() => ID)
	id!: string;
	@Field(() => String, { nullable: true })
	passage?: string | null;
	@Field(() => String, { nullable: true })
	imageUrl?: string | null;
	@Field()
	hasAudio!: boolean;
	@Field(() => String, { nullable: true })
	audioUrl?: string | null;
	@Field(() => Int, { nullable: true })
	audioStartMs?: number | null;
	@Field(() => Int, { nullable: true })
	audioEndMs?: number | null;
	@Field(() => Int, { nullable: true })
	audioMaxPlays?: number | null;
	@Field(() => Int)
	plays!: number;
	@Field(() => Int)
	positionMs!: number;
}

@ObjectType()
export class AttemptQuestion {
	@Field(() => ID)
	id!: string;
	@Field(() => QuestionKind)
	kind!: QuestionKind;
	@Field()
	prompt!: string;
	@Field(() => String, { nullable: true })
	imageUrl?: string | null;
	@Field(() => [AttemptChoice])
	choices!: AttemptChoice[];
	@Field(() => ID, { nullable: true })
	groupId?: string | null;
	@Field(() => ID, { nullable: true })
	selectedChoiceId?: string | null;
	@Field(() => String, { nullable: true })
	answerText?: string | null;
}

@ObjectType()
export class AttemptSection {
	@Field(() => SectionKind)
	kind!: SectionKind;
	@Field(() => String, { nullable: true })
	title?: string | null;
	@Field(() => String, { nullable: true })
	instructions?: string | null;
	@Field(() => [AttemptGroup])
	groups!: AttemptGroup[];
	@Field(() => [AttemptQuestion])
	questions!: AttemptQuestion[];
}

@ObjectType()
export class AttemptSummary {
	@Field(() => ID)
	id!: string;
	@Field(() => ID)
	examId!: string;
	@Field()
	examSlug!: string;
	@Field()
	dailyPractice!: boolean;
	@Field()
	title!: string;
	@Field(() => ID)
	versionId!: string;
	@Field(() => ID)
	variantId!: string;
	@Field()
	variantLabel!: string;
	@Field(() => AttemptMode)
	mode!: AttemptMode;
	@Field(() => AttemptStatus)
	status!: AttemptStatus;
	@Field(() => GraphQLISODateTime, { nullable: true })
	deadlineAt?: Date | null;
	@Field(() => GraphQLISODateTime)
	serverNow!: Date;
	@Field(() => Int)
	remainingMs!: number;
	@Field(() => Int)
	elapsedMs!: number;
	@Field(() => GraphQLISODateTime)
	createdAt!: Date;
	@Field(() => GraphQLISODateTime, { nullable: true })
	completedAt?: Date | null;
	@Field(() => SubmissionReason, { nullable: true })
	reason?: SubmissionReason | null;
	@Field(() => Int)
	score!: number;
	@Field(() => Int)
	maxScore!: number;
	@Field(() => Int)
	points!: number;
}

@ObjectType()
export class AttemptView extends AttemptSummary {
	@Field(() => ID, { nullable: true })
	currentQuestionId?: string | null;
	@Field(() => [AttemptSection])
	sections!: AttemptSection[];
}

@ObjectType()
export class AttemptAudio {
	@Field()
	url!: string;
	@Field(() => ID)
	playbackId!: string;
	@Field(() => Int)
	startMs!: number;
	@Field(() => Int, { nullable: true })
	endMs?: number | null;
	@Field(() => Int)
	positionMs!: number;
	@Field(() => Int)
	plays!: number;
	@Field(() => Int, { nullable: true })
	maxPlays?: number | null;
}

@ObjectType()
export class SectionResult {
	@Field(() => SectionKind)
	section!: SectionKind;
	@Field(() => Int)
	correct!: number;
	@Field(() => Int)
	wrong!: number;
	@Field(() => Int)
	unanswered!: number;
	@Field(() => Int)
	ungraded!: number;
	@Field(() => Int)
	score!: number;
	@Field(() => Int)
	maxScore!: number;
	@Field(() => Int)
	points!: number;
}

@ObjectType()
export class ReviewQuestion extends AttemptQuestion {
	@Field(() => SectionKind)
	section!: SectionKind;
	@Field(() => ID, { nullable: true })
	correctChoiceId?: string | null;
	@Field(() => String, { nullable: true })
	explanation?: string | null;
	@Field(() => String, { nullable: true })
	sampleAnswer?: string | null;
	@Field(() => String, { nullable: true })
	sampleAnswerImageUrl?: string | null;
	@Field(() => Int, { nullable: true })
	earnedScore?: number | null;
}

@ObjectType()
export class AttemptResult extends AttemptView {
	@Field(() => [SectionResult])
	sectionResults!: SectionResult[];
	@Field(() => [ReviewQuestion])
	review!: ReviewQuestion[];
}

@ObjectType()
export class AttemptHistory {
	@Field(() => [AttemptSummary])
	list!: AttemptSummary[];
	@Field(() => Int)
	total!: number;
	@Field(() => Int)
	distinctCompletedTests!: number;
	@Field(() => Int)
	memberPoints!: number;
}
