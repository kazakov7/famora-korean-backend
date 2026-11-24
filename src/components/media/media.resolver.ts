import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ParseUUIDPipe } from '@nestjs/common';
import { PageInput } from '../../libs/dto/common/page.input';
import { Media, MediaPage, MediaUpload } from '../../libs/dto/media/media';
import { MediaUploadInput } from '../../libs/dto/media/media.input';
import type { CurrentMember } from '../../libs/types/request';
import { SignedInMember } from '../auth/decorators/current-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MediaService } from './media.service';

@Resolver()
@UseGuards(AuthGuard)
export class MediaResolver {
	constructor(private readonly media: MediaService) {}

	@Mutation(() => MediaUpload)
	createMediaUpload(
		@SignedInMember() member: CurrentMember,
		@Args('input') input: MediaUploadInput,
	) {
		return this.media.createUpload(member, input);
	}

	@Mutation(() => Media)
	completeMediaUpload(
		@SignedInMember() member: CurrentMember,
		@Args('id', ParseUUIDPipe) id: string,
	) {
		return this.media.completeUpload(member, id);
	}

	@Query(() => MediaPage)
	@UseGuards(RolesGuard)
	@Roles(['ADMIN'])
	getAdminMedia(@Args('page') page: PageInput) {
		return this.media.list(page);
	}
}
