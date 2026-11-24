import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
	IsBoolean,
	IsInt,
	IsOptional,
	IsUUID,
	Length,
	Matches,
	Min,
} from 'class-validator';

@InputType()
export class MenuInput {
	@Field(() => ID, { nullable: true })
	@IsOptional()
	@IsUUID()
	id?: string;

	@Field(() => ID, { nullable: true })
	@IsOptional()
	@IsUUID()
	parentId?: string | null;

	@Field()
	@Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
	@Length(1, 100)
	slug!: string;

	@Field()
	@Length(1, 150)
	name!: string;

	@Field(() => Int)
	@IsInt()
	@Min(0)
	sortOrder!: number;

	@Field()
	@IsBoolean()
	published!: boolean;
}

@InputType()
export class ExamMenuInput {
	@Field(() => ID)
	@IsUUID()
	examId!: string;

	@Field(() => ID)
	@IsUUID()
	menuId!: string;

	@Field(() => Int)
	@IsInt()
	@Min(0)
	sortOrder!: number;
}
