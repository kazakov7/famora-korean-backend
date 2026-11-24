import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
	IsInt,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	Matches,
	Max,
	Min,
	MaxLength,
} from 'class-validator';

@InputType()
export class UpdateMemberInput {
	@Field(() => String, { nullable: true })
	@IsOptional()
	@Length(3, 32)
	@Matches(/^[\p{L}\p{N}_]+$/u)
	nickname?: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@Length(1, 120)
	fullName?: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@Matches(/^[+0-9 ()-]*$/)
	@MaxLength(35)
	phone?: string | null;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(120)
	age?: number | null;

	@Field(() => ID, { nullable: true })
	@IsOptional()
	@IsUUID()
	imageId?: string | null;
}
