import { UseGuards } from '@nestjs/common';
import { Args, Context, ID, Mutation, Resolver } from '@nestjs/graphql';
import { AuthMethod, ChallengePurpose } from '@prisma/client';
import {
	ChangePasswordInput,
	NewPasswordInput,
	NicknameInput,
	NicknameLoginInput,
	ResetPasswordInput,
	SignupInput,
	VerifyOtpInput,
} from '../../libs/dto/auth/auth.input';
import type { ApiContext, CurrentMember } from '../../libs/types/request';
import { AuthService } from './auth.service';
import { SignedInMember } from './decorators/current-member.decorator';
import { AuthGuard } from './guards/auth.guard';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

@Resolver()
export class AuthResolver {
	constructor(
		private readonly auth: AuthService,
		private readonly sessions: SessionService,
		private readonly otp: OtpService,
	) {}

	@Mutation(() => Boolean)
	async signup(@Args('input') input: SignupInput, @Context() { req, res }: ApiContext) {
		const member = await this.auth.signup(input, req.ip ?? 'unknown');
		await this.sessions.open(member.id, AuthMethod.NICKNAME, res);
		return true;
	}

	@Mutation(() => Boolean)
	async login(
		@Args('input') input: NicknameLoginInput,
		@Context() { req, res }: ApiContext,
	) {
		const member = await this.auth.login(input, req.ip ?? 'unknown');
		await this.sessions.open(member.id, AuthMethod.NICKNAME, res);
		return true;
	}

	@Mutation(() => Boolean)
	refreshSession(@Context() { req, res }: ApiContext) {
		return this.sessions.refresh(req, res);
	}

	@Mutation(() => Boolean)
	logout(@Context() { req, res }: ApiContext) {
		return this.sessions.logout(req, res);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Boolean)
	setFirstPassword(
		@SignedInMember() member: CurrentMember,
		@Args('input') input: NewPasswordInput,
	) {
		return this.auth.firstPassword(member, input.password);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Boolean)
	changePassword(
		@SignedInMember() member: CurrentMember,
		@Args('input') input: ChangePasswordInput,
	) {
		return this.auth.changePassword(member, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Boolean)
	async verifyGmailOtp(
		@SignedInMember() member: CurrentMember,
		@Args('input') input: VerifyOtpInput,
	) {
		await this.otp.verify(
			input.challengeId,
			input.code,
			ChallengePurpose.LINK_GMAIL,
			member.memberId,
		);
		return true;
	}

	@Mutation(() => ID)
	requestPasswordReset(
		@Args('input') input: NicknameInput,
		@Context() { req }: ApiContext,
	) {
		return this.auth.requestReset(input.nickname, req.ip ?? 'unknown');
	}

	@Mutation(() => String)
	verifyPasswordResetOtp(@Args('input') input: VerifyOtpInput) {
		return this.otp.verify(
			input.challengeId,
			input.code,
			ChallengePurpose.RESET_PASSWORD,
		);
	}

	@Mutation(() => Boolean)
	resetPassword(@Args('input') input: ResetPasswordInput) {
		return this.auth.resetPassword(input);
	}
}
