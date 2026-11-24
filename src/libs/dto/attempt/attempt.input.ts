import { Field, ID, InputType, Int, registerEnumType } from '@nestjs/graphql';
import {
	IsBoolean,
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
} from 'class-validator';

export enum AttemptMode {
	FULL = 'FULL',
	LISTENING = 'LISTENING',
	READING = 'READING',
	WRITING = 'WRITING',
}

registerEnumType(AttemptMode, { name: 'AttemptMode' });

@InputType()
export class StartAttemptInput {
	@Field(() => ID)
	@IsUUID()
	examId!: string;
	@Field(() => AttemptMode)
	@IsEnum(AttemptMode)
	mode!: AttemptMode;
}

@InputType()
export class MoveAttemptInput {
	@Field(() => ID)
	@IsUUID()
	attemptId!: string;
	@Field(() => ID)
	@IsUUID()
	questionId!: string;
}

@InputType()
export class AnswerInput extends MoveAttemptInput {
	@Field(() => ID, { nullable: true })
	@IsOptional()
	@IsUUID()
	choiceId?: string | null;
	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(30000)
	text?: string | null;
}

@InputType()
export class StartAudioInput {
	@Field(() => ID)
	@IsUUID()
	attemptId!: string;
	@Field(() => ID)
	@IsUUID()
	groupId!: string;
	@Field(() => Boolean, { defaultValue: false })
	@IsBoolean()
	replay = false;
}

@InputType()
export class SaveAudioInput {
	@Field(() => ID)
	@IsUUID()
	attemptId!: string;
	@Field(() => ID)
	@IsUUID()
	groupId!: string;
	@Field(() => ID)
	@IsUUID()
	playbackId!: string;
	@Field(() => Int)
	@IsInt()
	@Min(0)
	positionMs!: number;
	@Field(() => Boolean, { defaultValue: false })
	@IsBoolean()
	finished = false;
}
