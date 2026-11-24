import { Field, GraphQLISODateTime, ID, Int, ObjectType } from '@nestjs/graphql';
import { SectionKind } from '@prisma/client';

@ObjectType()
export class VocabularyOrigin {
	@Field(() => ID)
	attemptId!: string;
	@Field(() => ID)
	questionId!: string;
	@Field(() => ID)
	examId!: string;
	@Field()
	examSlug!: string;
	@Field()
	examTitle!: string;
	@Field(() => SectionKind)
	section!: SectionKind;
	@Field(() => GraphQLISODateTime)
	createdAt!: Date;
}

@ObjectType()
export class VocabularyWord {
	@Field(() => ID)
	id!: string;
	@Field()
	languageCode!: string;
	@Field()
	term!: string;
	@Field(() => String, { nullable: true })
	translation?: string | null;
	@Field(() => String, { nullable: true })
	note?: string | null;
	@Field(() => GraphQLISODateTime)
	createdAt!: Date;
	@Field(() => [VocabularyOrigin])
	sources!: VocabularyOrigin[];
}

@ObjectType()
export class VocabularyPage {
	@Field(() => [VocabularyWord])
	list!: VocabularyWord[];
	@Field(() => Int)
	total!: number;
}

@ObjectType()
export class VocabularyUnitWord {
	@Field(() => ID)
	id!: string;
	@Field()
	term!: string;
	@Field()
	translation!: string;
}

@ObjectType()
export class VocabularyUnit {
	@Field()
	collectionSlug!: string;
	@Field(() => [String])
	collectionPath!: string[];
	@Field()
	languageCode!: string;
	@Field(() => [VocabularyUnitWord])
	words!: VocabularyUnitWord[];
}
