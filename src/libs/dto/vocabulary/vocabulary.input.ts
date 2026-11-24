import { Field, ID, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

@InputType()
export class SaveVocabularyInput {
	@Field(() => ID)
	@IsUUID()
	attemptId!: string;
	@Field(() => ID)
	@IsUUID()
	questionId!: string;
	@Field()
	@Length(1, 250)
	term!: string;
}

@InputType()
export class UpdateVocabularyInput {
	@Field(() => ID)
	@IsUUID()
	id!: string;
	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(1500)
	translation?: string | null;
	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	note?: string | null;
}
