import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Menu {
	@Field(() => ID)
	id!: string;

	@Field(() => ID, { nullable: true })
	parentId?: string | null;

	@Field()
	slug!: string;

	@Field(() => String, { nullable: true })
	systemKey?: string | null;

	@Field()
	name!: string;

	@Field(() => Int)
	sortOrder!: number;

	@Field()
	published!: boolean;
}

@ObjectType()
export class ExamLanguage {
	@Field()
	code!: string;

	@Field()
	name!: string;

	@Field()
	active!: boolean;
}

@ObjectType()
export class ExamFamily {
	@Field(() => ID)
	id!: string;

	@Field()
	languageCode!: string;

	@Field()
	key!: string;

	@Field()
	name!: string;
}
