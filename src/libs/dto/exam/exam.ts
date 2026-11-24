import { Field, GraphQLISODateTime, ID, Int, ObjectType } from '@nestjs/graphql';
import { ExamKind, QuestionKind, SectionKind } from '@prisma/client';

@ObjectType()
export class ExamSectionOverview {
	@Field(() => SectionKind)
	kind!: SectionKind;
	@Field(() => String, { nullable: true })
	title?: string | null;
	@Field(() => Int)
	durationSeconds!: number;
}

@ObjectType()
export class ExamOverview {
	@Field(() => ID)
	id!: string;
	@Field()
	slug!: string;
	@Field()
	title!: string;
	@Field(() => String, { nullable: true })
	description?: string | null;
	@Field(() => ExamKind)
	kind!: ExamKind;
	@Field()
	languageCode!: string;
	@Field(() => Int)
	durationSeconds!: number;
	@Field(() => String, { nullable: true })
	coverUrl?: string | null;
	@Field(() => [ExamSectionOverview])
	sections!: ExamSectionOverview[];
}

@ObjectType()
export class ExamPage {
	@Field(() => [ExamOverview])
	list!: ExamOverview[];
	@Field(() => Int)
	total!: number;
}

@ObjectType()
export class AdminExamVersionSummary {
	@Field(() => ID)
	id!: string;
	@Field(() => Int)
	number!: number;
	@Field()
	title!: string;
	@Field(() => String, { nullable: true })
	description?: string | null;
	@Field(() => Int)
	durationSeconds!: number;
	@Field(() => ID, { nullable: true })
	coverId?: string | null;
	@Field(() => GraphQLISODateTime, { nullable: true })
	publishedAt?: Date | null;
}

@ObjectType()
export class AdminExam {
	@Field(() => ID)
	id!: string;
	@Field()
	slug!: string;
	@Field(() => ExamKind)
	kind!: ExamKind;
	@Field()
	languageCode!: string;
	@Field(() => ID, { nullable: true })
	familyId?: string | null;
	@Field(() => ID, { nullable: true })
	currentVersionId?: string | null;
	@Field(() => GraphQLISODateTime, { nullable: true })
	archivedAt?: Date | null;
	@Field(() => [ID])
	menuIds!: string[];
	@Field(() => [AdminExamVersionSummary])
	versions!: AdminExamVersionSummary[];
}

@ObjectType()
export class AdminExamPage {
	@Field(() => [AdminExam])
	list!: AdminExam[];
	@Field(() => Int)
	total!: number;
}

@ObjectType()
export class AdminChoice {
	@Field(() => ID)
	id!: string;
	@Field(() => String, { nullable: true })
	text?: string | null;
	@Field(() => ID, { nullable: true })
	imageId?: string | null;
	@Field(() => Int)
	sortOrder!: number;
	@Field()
	correct!: boolean;
}

@ObjectType()
export class AdminQuestion {
	@Field(() => ID)
	id!: string;
	@Field(() => QuestionKind)
	kind!: QuestionKind;
	@Field()
	prompt!: string;
	@Field(() => ID, { nullable: true })
	groupId?: string | null;
	@Field(() => ID, { nullable: true })
	imageId?: string | null;
	@Field(() => Int)
	sortOrder!: number;
	@Field(() => Int)
	points!: number;
	@Field(() => String, { nullable: true })
	explanation?: string | null;
	@Field(() => String, { nullable: true })
	sampleAnswer?: string | null;
	@Field(() => [AdminChoice])
	choices!: AdminChoice[];
}

@ObjectType()
export class AdminQuestionGroup {
	@Field(() => ID)
	id!: string;
	@Field(() => String, { nullable: true })
	passage?: string | null;
	@Field(() => ID, { nullable: true })
	imageId?: string | null;
	@Field(() => ID, { nullable: true })
	audioId?: string | null;
	@Field(() => Int, { nullable: true })
	audioStartMs?: number | null;
	@Field(() => Int, { nullable: true })
	audioEndMs?: number | null;
	@Field(() => Int, { nullable: true })
	audioMaxPlays?: number | null;
}

@ObjectType()
export class AdminSection extends ExamSectionOverview {
	@Field(() => ID)
	id!: string;
	@Field(() => String, { nullable: true })
	instructions?: string | null;
	@Field(() => Int)
	sortOrder!: number;
	@Field(() => Int, { nullable: true })
	audioMaxPlays?: number | null;
	@Field(() => [AdminQuestionGroup])
	groups!: AdminQuestionGroup[];
	@Field(() => [AdminQuestion])
	questions!: AdminQuestion[];
}

@ObjectType()
export class AdminVariant {
	@Field(() => ID)
	id!: string;
	@Field()
	label!: string;
	@Field(() => Int)
	sortOrder!: number;
	@Field(() => [AdminSection])
	sections!: AdminSection[];
}

@ObjectType()
export class AdminExamVersion extends AdminExamVersionSummary {
	@Field(() => ID)
	examId!: string;
	@Field(() => [AdminVariant])
	variants!: AdminVariant[];
}
