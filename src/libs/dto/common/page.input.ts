import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, Max, Min } from 'class-validator';

@InputType()
export class PageInput {
	@Field(() => Int, { defaultValue: 0 })
	@IsInt()
	@Min(0)
	offset = 0;

	@Field(() => Int, { defaultValue: 20 })
	@IsInt()
	@Min(1)
	@Max(100)
	limit = 20;
}
