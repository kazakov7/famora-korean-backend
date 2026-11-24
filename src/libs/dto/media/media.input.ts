import { Field, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const AUDIO_TYPES = [
	'audio/mpeg',
	'audio/mp4',
	'audio/ogg',
	'audio/wav',
	'audio/webm',
	'audio/aac',
];

@InputType()
export class MediaUploadInput {
	@Field()
	@IsIn([...IMAGE_TYPES, ...AUDIO_TYPES])
	contentType!: string;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@Max(100 * 1024 * 1024)
	sizeBytes!: number;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	durationMs?: number | null;
}
