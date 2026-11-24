import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { AuthMethod, ChallengePurpose, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type {
	ChangePasswordInput,
	NicknameLoginInput,
	ResetPasswordInput,
	SignupInput,
} from '../../libs/dto/auth/auth.input';
import type { CurrentMember } from '../../libs/types/request';
import { AuthThrottleService } from './auth-throttle.service';
import { automaticNickname, nicknameKey } from './nickname';
import { OtpService } from './otp.service';
import { checkPassword, hashPassword } from './password';
import type { ProviderProfile } from './providers/oidc';
import { digest } from './session.service';

const isUniqueError = (error: unknown) =>
	error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

@Injectable()
export class AuthService {
	constructor(
		private readonly db: PrismaService,
		private readonly otp: OtpService,
		private readonly throttle: AuthThrottleService,
	) {}

	async signup(input: SignupInput, ip: string) {
		await this.throttle.take('signup', ip, 12, 60 * 60 * 1000);
		const fullName = input.fullName.trim();
		if (!fullName) throw new BadRequestException('Enter a name');
		const hash = await hashPassword(input.password);
		try {
			return await this.db.member.create({
				data: {
					memberNick: input.nickname,
					memberNickKey: nicknameKey(input.nickname),
					memberFullName: fullName,
					memberAuthType: 'NICKNAME',
					credential: { create: { hash } },
				},
				select: { id: true },
			});
		} catch (error) {
			if (isUniqueError(error)) throw new ConflictException('Nickname is already in use');
			throw error;
		}
	}

	async login(input: NicknameLoginInput, ip: string) {
		const key = nicknameKey(input.nickname);
		await this.throttle.take('login-ip', ip, 40, 15 * 60 * 1000);
		await this.throttle.take('login-nick', key, 12, 15 * 60 * 1000);
		const member = await this.db.member.findUnique({
			where: { memberNickKey: key },
			include: { credential: true },
		});
		const valid = await checkPassword(input.password, member?.credential?.hash);
		if (!member || !valid)
			throw new UnauthorizedException('Invalid nickname or password');
		return member;
	}

	async firstPassword(member: CurrentMember, password: string) {
		if (member.method === AuthMethod.NICKNAME)
			throw new ForbiddenException('Use the password change form');
		try {
			await this.db.passwordCredential.create({
				data: { memberId: member.memberId, hash: await hashPassword(password) },
			});
		} catch (error) {
			if (isUniqueError(error))
				throw new ConflictException('This profile already has a password');
			throw error;
		}
		return true;
	}

	async changePassword(member: CurrentMember, input: ChangePasswordInput) {
		if (member.method !== AuthMethod.NICKNAME)
			throw new ForbiddenException('Sign in with nickname and password');
		await this.throttle.take('change-password', member.memberId, 10, 15 * 60 * 1000);
		const credential = await this.db.passwordCredential.findUnique({
			where: { memberId: member.memberId },
		});
		if (!credential || !(await checkPassword(input.oldPassword, credential.hash))) {
			throw new UnauthorizedException('Invalid current password');
		}
		const next = await hashPassword(input.password);
		await this.db.serial(async (tx) => {
			const { count } = await tx.passwordCredential.updateMany({
				where: { memberId: member.memberId, hash: credential.hash },
				data: { hash: next },
			});
			if (!count) throw new ConflictException('Password changed. Sign in again.');
			await tx.authChallenge.updateMany({
				where: {
					memberId: member.memberId,
					purpose: 'RESET_PASSWORD',
					grantUsedAt: null,
				},
				data: { consumedAt: new Date(), grantUsedAt: new Date() },
			});
			await tx.authSession.updateMany({
				where: {
					memberId: member.memberId,
					id: { not: member.sessionId },
					method: 'NICKNAME',
					revokedAt: null,
				},
				data: { revokedAt: new Date() },
			});
		});
		return true;
	}

	async requestReset(nickname: string, ip: string) {
		const key = nicknameKey(nickname);
		await this.throttle.take('reset-ip', ip, 20, 60 * 60 * 1000);
		await this.throttle.take('reset-nick', key, 5, 60 * 60 * 1000);
		const member = await this.db.member.findUnique({
			where: { memberNickKey: key },
			include: { credential: true },
		});
		if (!member?.recoveryEmail || !member.credential) return randomUUID();
		return this.otp.issue(
			member.id,
			member.recoveryEmail,
			ChallengePurpose.RESET_PASSWORD,
		);
	}

	async resetPassword(input: ResetPasswordInput) {
		const hash = await hashPassword(input.password);
		return this.db.serial(async (tx) => {
			const now = new Date();
			const challenge = await tx.authChallenge.findUnique({
				where: { id: input.challengeId },
				include: { member: true },
			});
			if (
				!challenge ||
				challenge.purpose !== ChallengePurpose.RESET_PASSWORD ||
				challenge.grantHash !== digest(input.grant) ||
				challenge.grantUsedAt ||
				!challenge.grantExpiresAt ||
				challenge.grantExpiresAt <= now ||
				challenge.member.recoveryEmail !== challenge.email
			) {
				throw new UnauthorizedException('The password reset grant is invalid or expired');
			}
			await tx.authChallenge.updateMany({
				where: {
					memberId: challenge.memberId,
					purpose: 'RESET_PASSWORD',
					grantUsedAt: null,
				},
				data: { consumedAt: now, grantUsedAt: now },
			});
			await tx.passwordCredential.update({
				where: { memberId: challenge.memberId },
				data: { hash },
			});
			await tx.authSession.updateMany({
				where: { memberId: challenge.memberId, method: 'NICKNAME', revokedAt: null },
				data: { revokedAt: now },
			});
			return true;
		});
	}

	async socialLogin(method: AuthMethod, profile: ProviderProfile, linkMemberId?: string) {
		const identityKey = { method_subject: { method, subject: profile.subject } };
		const found = await this.db.authIdentity.findUnique({ where: identityKey });
		if (found) {
			if (linkMemberId && found.memberId !== linkMemberId)
				throw new ConflictException(
					'Provider identity already belongs to another profile',
				);
			return found.memberId;
		}
		if (linkMemberId) {
			try {
				await this.db.authIdentity.create({
					data: { memberId: linkMemberId, method, subject: profile.subject },
				});
			} catch (error) {
				if (isUniqueError(error))
					throw new ConflictException('Provider identity already linked');
				throw error;
			}
			return linkMemberId;
		}
		const fallback = method === AuthMethod.TELEGRAM ? 'telegram_user' : 'google_user';
		const name = profile.name?.trim().slice(0, 120) || fallback;
		const base = automaticNickname(
			method === AuthMethod.TELEGRAM ? profile.username || name : name,
			fallback,
		);
		for (let attempt = 1; attempt <= 100; attempt += 1) {
			const nick = attempt > 1 ? base + '_' + attempt : base;
			try {
				const member = await this.db.member.create({
					data: {
						memberNick: nick,
						memberNickKey: nicknameKey(nick),
						memberFullName: name,
						memberAuthType: method,
						providerImageUrl: profile.picture,
						identities: {
							create: {
								method,
								subject: profile.subject,
								email: profile.emailVerified ? profile.email : undefined,
							},
						},
					},
					select: { id: true },
				});
				return member.id;
			} catch (error) {
				if (!isUniqueError(error)) throw error;
				const existing = await this.db.authIdentity.findUnique({ where: identityKey });
				if (existing) return existing.memberId;
			}
		}
		throw new ConflictException('Could not choose an available nickname');
	}

	linkGoogle(memberId: string, profile: ProviderProfile) {
		const email = profile.email?.trim().toLowerCase();
		if (!profile.emailVerified || !email?.endsWith('@gmail.com')) {
			throw new BadRequestException('Choose a verified Gmail account');
		}
		return this.otp.issue(memberId, email, ChallengePurpose.LINK_GMAIL, profile.subject);
	}
}
