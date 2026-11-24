import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Member } from '../../libs/dto/member/member';
import { UpdateMemberInput } from '../../libs/dto/member/member.input';
import type { CurrentMember } from '../../libs/types/request';
import { SignedInMember } from '../auth/decorators/current-member.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { MemberService } from './member.service';

@Resolver()
@UseGuards(AuthGuard)
export class MemberResolver {
	constructor(private readonly members: MemberService) {}

	@Query(() => Member)
	getMe(@SignedInMember() member: CurrentMember) {
		return this.members.me(member);
	}

	@Mutation(() => Member)
	updateMember(
		@SignedInMember() member: CurrentMember,
		@Args('input') input: UpdateMemberInput,
	) {
		return this.members.update(member, input);
	}
}
