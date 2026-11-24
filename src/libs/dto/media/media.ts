import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Media {
	@Field(() => ID)
	id!: string;

	@Field()
	contentType!: string;

	@Field(() => Int)
	sizeBytes!: number;

	@Field(() => Int, { nullable: true })
	durationMs?: number | null;

	@Field(() => String, { nullable: true })
	url?: string | null;
}

@ObjectType()
export class MediaUpload {
	@Field(() => ID)
	id!: string;

	@Field()
	uploadUrl!: string;

	@Field()
	contentType!: string;
}

@ObjectType()
export class MediaPage {
	@Field(() => [Media])
	list!: Media[];

	@Field(() => Int)
	total!: number;
}
