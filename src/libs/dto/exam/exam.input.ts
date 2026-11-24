import { Type } from 'class-transformer';
import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { ExamKind, QuestionKind, SectionKind } from '@prisma/client';
import {
	ArrayMaxSize,
	IsBoolean,
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	Matches,
	Max,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';

@InputType()
export class ExamDraftInput {
	@Field()
	@Length(1, 250)
	title!: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(10000)
	description?: string | null;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@Max(86400)
	durationSeconds!: number;

	@Field(() => ID, { nullable: true })
	@IsOptional()
	@IsUUID()
	coverId?: string | null;
}

@InputType()
export class CreateExamInput extends ExamDraftInput {
	@Field()
	@Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
	@Length(1, 140)
	slug!: string;

	@Field(() => ExamKind)
	@IsEnum(ExamKind)
	kind!: ExamKind;

	@Field()
	@Matches(/^[a-z]{2,3}$/)
	languageCode!: string;

	@Field(() => ID, { nullable: true })
	@IsOptional()
	@IsUUID()
	familyId?: string | null;
}

@InputType()
export class VariantInput {
	@Field()
	@Length(1, 150)
	label!: string;

	@Field(() => Int)
	@IsInt()
	@Min(0)
	sortOrder!: number;
}

@InputType()
export class SectionInput {
	@Field(() => SectionKind)
	@IsEnum(SectionKind)
	kind!: SectionKind;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@Length(1, 200)
	title?: string | null;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(15000)
	instructions?: string | null;

	@Field(() => Int)
	@IsInt()
	@Min(0)
	sortOrder!: number;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@Max(86400)
	durationSeconds!: number;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	audioMaxPlays?: number | null;
}

@InputType()
export class QuestionGroupInput {
	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(30000)
	passage?: string | null;

	@Field(() => ID, { nullable: true })
	@IsOptional()
	@IsUUID()
	imageId?: string | null;

	@Field(() => ID, { nullable: true })
	@IsOptional()
	@IsUUID()
	audioId?: string | null;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(0)
	audioStartMs?: number | null;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	audioEndMs?: number | null;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	audioMaxPlays?: number | null;
}

@InputType()
export class ChoiceInput {
	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(15000)
	text?: string | null;

	@Field(() => ID, { nullable: true })
	@IsOptional()
	@IsUUID()
	imageId?: string | null;

	@Field()
	@IsBoolean()
	correct!: boolean;
}

@InputType()
export class QuestionInput {
	@Field(() => QuestionKind)
	@IsEnum(QuestionKind)
	kind!: QuestionKind;

	@Field()
	@IsString()
	@MaxLength(30000)
	prompt!: string;

	@Field(() => ID, { nullable: true })
	@IsOptional()
	@IsUUID()
	groupId?: string | null;

	@Field(() => ID, { nullable: true })
	@IsOptional()
	@IsUUID()
	imageId?: string | null;

	@Field(() => Int)
	@IsInt()
	@Min(0)
	sortOrder!: number;

	@Field(() => Int)
	@IsInt()
	@Min(0)
	@Max(999)
	points!: number;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(30000)
	explanation?: string | null;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(30000)
	sampleAnswer?: string | null;

	@Field(() => [ChoiceInput], { defaultValue: [] })
	@ArrayMaxSize(12)
	@ValidateNested({ each: true })
	@Type(() => ChoiceInput)
	choices: ChoiceInput[] = [];
}

@InputType()
export class ExamFilterInput {
	@Field(() => String, { nullable: true })
	@IsOptional()
	@Length(1, 100)
	menuSlug?: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@Matches(/^[a-z]{2,3}$/)
	languageCode?: string;

	@Field(() => ExamKind, { nullable: true })
	@IsOptional()
	@IsEnum(ExamKind)
	kind?: ExamKind;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@Length(1, 150)
	search?: string;
}
