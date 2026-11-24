import { ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { PageInput } from '../../libs/dto/common/page.input';
import {
	VocabularyPage,
	VocabularyUnit,
	VocabularyWord,
} from '../../libs/dto/vocabulary/vocabulary';
import {
	SaveVocabularyInput,
	UpdateVocabularyInput,
} from '../../libs/dto/vocabulary/vocabulary.input';
import type { CurrentMember } from '../../libs/types/request';
import { SignedInMember } from '../auth/decorators/current-member.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { VocabularyService } from './vocabulary.service';

@Resolver()
export class VocabularyCatalogResolver {
	constructor(private readonly vocabulary: VocabularyService) {}

	@Query(() => VocabularyUnit)
	getVocabularyUnit(@Args('slug') slug: string) {
		return this.vocabulary.unit(slug);
	}
}

@Resolver()
@UseGuards(AuthGuard)
export class VocabularyResolver {
	constructor(private readonly vocabulary: VocabularyService) {}

	@Query(() => VocabularyPage)
	getVocabulary(@SignedInMember() member: CurrentMember, @Args('page') page: PageInput) {
		return this.vocabulary.list(member.memberId, page);
	}

	@Mutation(() => VocabularyWord)
	saveVocabularyWord(
		@SignedInMember() member: CurrentMember,
		@Args('input') input: SaveVocabularyInput,
	) {
		return this.vocabulary.save(member.memberId, input);
	}

	@Mutation(() => VocabularyWord)
	saveVocabularyUnitWord(
		@SignedInMember() member: CurrentMember,
		@Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
	) {
		return this.vocabulary.saveUnitWord(member.memberId, id);
	}

	@Mutation(() => VocabularyWord)
	updateVocabularyWord(
		@SignedInMember() member: CurrentMember,
		@Args('input') input: UpdateVocabularyInput,
	) {
		return this.vocabulary.update(member.memberId, input);
	}
}
