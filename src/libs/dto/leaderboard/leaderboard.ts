import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class LeaderboardMember {
	@Field(() => ID)
	id!: string;
	@Field()
	memberNick!: string;
	@Field(() => String, { nullable: true })
	memberImage?: string | null;
	@Field(() => Int)
	rank!: number;
	@Field(() => Int)
	memberPoints!: number;
}

@ObjectType()
export class LeaderboardPage {
	@Field(() => [LeaderboardMember])
	list!: LeaderboardMember[];
	@Field(() => Int)
	total!: number;
}
