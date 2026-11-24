import { ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
	AnswerInput,
	MoveAttemptInput,
	SaveAudioInput,
	StartAttemptInput,
	StartAudioInput,
} from '../../libs/dto/attempt/attempt.input';
import {
	AttemptAudio,
	AttemptHistory,
	AttemptResult,
	AttemptSummary,
	AttemptView,
} from '../../libs/dto/attempt/attempt';
import { PageInput } from '../../libs/dto/common/page.input';
import type { CurrentMember } from '../../libs/types/request';
import { SignedInMember } from '../auth/decorators/current-member.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AttemptService } from './attempt.service';

@Resolver()
@UseGuards(AuthGuard)
export class AttemptResolver {
	constructor(private readonly attempts: AttemptService) {}

	@Mutation(() => Int)
	recordExamOpen(
		@SignedInMember() member: CurrentMember,
		@Args('examId', { type: () => ID }, ParseUUIDPipe) examId: string,
	) {
		return this.attempts.recordOpen(member.memberId, examId);
	}

	@Mutation(() => AttemptView)
	startAttempt(
		@SignedInMember() member: CurrentMember,
		@Args('input') input: StartAttemptInput,
	) {
		return this.attempts.start(member.memberId, input);
	}

	@Query(() => AttemptView)
	getAttempt(
		@SignedInMember() member: CurrentMember,
		@Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
	) {
		return this.attempts.get(member.memberId, id);
	}

	@Query(() => [AttemptSummary])
	getPendingAttempts(@SignedInMember() member: CurrentMember) {
		return this.attempts.pending(member.memberId);
	}

	@Query(() => AttemptHistory)
	getAttemptHistory(
		@SignedInMember() member: CurrentMember,
		@Args('page') page: PageInput,
	) {
		return this.attempts.history(member.memberId, page);
	}

	@Query(() => AttemptResult)
	getAttemptResult(
		@SignedInMember() member: CurrentMember,
		@Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
	) {
		return this.attempts.result(member.memberId, id);
	}

	@Mutation(() => Boolean)
	moveAttempt(
		@SignedInMember() member: CurrentMember,
		@Args('input') input: MoveAttemptInput,
	) {
		return this.attempts.move(member.memberId, input);
	}

	@Mutation(() => Boolean)
	saveAttemptAnswer(
		@SignedInMember() member: CurrentMember,
		@Args('input') input: AnswerInput,
	) {
		return this.attempts.saveAnswer(member.memberId, input);
	}

	@Mutation(() => AttemptAudio)
	playAttemptAudio(
		@SignedInMember() member: CurrentMember,
		@Args('input') input: StartAudioInput,
	) {
		return this.attempts.playAudio(member.memberId, input);
	}

	@Mutation(() => Boolean)
	saveAttemptAudio(
		@SignedInMember() member: CurrentMember,
		@Args('input') input: SaveAudioInput,
	) {
		return this.attempts.saveAudio(member.memberId, input);
	}

	@Mutation(() => AttemptView)
	pauseAttempt(
		@SignedInMember() member: CurrentMember,
		@Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
	) {
		return this.attempts.pause(member.memberId, id);
	}

	@Mutation(() => AttemptView)
	resumeAttempt(
		@SignedInMember() member: CurrentMember,
		@Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
	) {
		return this.attempts.resume(member.memberId, id);
	}

	@Mutation(() => AttemptResult)
	submitAttempt(
		@SignedInMember() member: CurrentMember,
		@Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
	) {
		return this.attempts.submit(member.memberId, id);
	}
}
