import {
	BadRequestException,
	ConflictException,
	Injectable,
	ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChallengePurpose } from '@prisma/client';
import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createTransport } from 'nodemailer';
import { PrismaService } from '../../database/prisma.service';
import { AuthThrottleService } from './auth-throttle.service';
import { digest, equalDigest } from './session.service';

const OTP_MS = 10 * 60 * 1000;

@Injectable()
export class OtpService {
	constructor(
		private readonly db: PrismaService,
		private readonly config: ConfigService,
		private readonly throttle: AuthThrottleService,
	) {}

	async issue(
		memberId: string,
		email: string,
		purpose: ChallengePurpose,
		subject?: string,
	) {
		const smtpUrl = this.config.get<string>('SMTP_URL');
		const from = this.config.get<string>('MAIL_FROM');
		if (!smtpUrl || !from)
			throw new ServiceUnavailableException('Email delivery is not configured');
		await this.throttle.take('otp-mail', memberId, 5, 60 * 60 * 1000);
		const id = randomUUID();
		const code = String(randomInt(0, 1000000)).padStart(6, '0');
		await this.db.serial(async (tx) => {
			await tx.authChallenge.updateMany({
				where: { memberId, purpose, consumedAt: null },
				data: { consumedAt: new Date() },
			});
			await tx.authChallenge.create({
				data: {
					id,
					memberId,
					email,
					subject,
					purpose,
					codeHash: this.codeHash(id, code),
					expiresAt: new Date(Date.now() + OTP_MS),
				},
			});
		});
		try {
			await createTransport(smtpUrl).sendMail({
				from,
				to: email,
				subject: 'Quiz confirmation code',
				text: 'Confirmation code: ' + code + '\nThe code expires in 10 minutes.',
			});
		} catch {
			await this.db.authChallenge.update({
				where: { id },
				data: { consumedAt: new Date() },
			});
			throw new ServiceUnavailableException('Could not deliver confirmation code');
		}
		return id;
	}

	async verify(id: string, code: string, purpose: ChallengePurpose, memberId?: string) {
		const grant = randomBytes(32).toString('base64url');
		const verified = await this.db.serial(async (tx) => {
			const now = new Date();
			const challenge = await tx.authChallenge.findUnique({ where: { id } });
			if (
				!challenge ||
				challenge.purpose !== purpose ||
				challenge.consumedAt ||
				challenge.expiresAt <= now ||
				challenge.attempts >= 5 ||
				(memberId && challenge.memberId !== memberId)
			)
				return false;
			if (!equalDigest(this.codeHash(id, code), challenge.codeHash)) {
				await tx.authChallenge.update({
					where: { id },
					data: { attempts: { increment: 1 } },
				});
				return false;
			}
			if (purpose === ChallengePurpose.LINK_GMAIL) {
				if (!challenge.subject) return false;
				const identity = await tx.authIdentity.findUnique({
					where: { method_subject: { method: 'GOOGLE', subject: challenge.subject } },
				});
				const owner = await tx.member.findUnique({
					where: { recoveryEmail: challenge.email },
					select: { id: true },
				});
				if (
					(identity && identity.memberId !== memberId) ||
					(owner && owner.id !== memberId)
				) {
					throw new ConflictException('This Google account is already linked');
				}
				await tx.authIdentity.upsert({
					where: { memberId_method: { memberId: challenge.memberId, method: 'GOOGLE' } },
					create: {
						memberId: challenge.memberId,
						method: 'GOOGLE',
						email: challenge.email,
						subject: challenge.subject,
					},
					update: { subject: challenge.subject, email: challenge.email },
				});
				await tx.member.update({
					where: { id: challenge.memberId },
					data: { recoveryEmail: challenge.email },
				});
			} else {
				const member = await tx.member.findUnique({ where: { id: challenge.memberId } });
				if (member?.recoveryEmail !== challenge.email) return false;
			}
			await tx.authChallenge.update({
				where: { id },
				data: {
					consumedAt: now,
					grantHash: purpose === 'RESET_PASSWORD' ? digest(grant) : null,
					grantExpiresAt:
						purpose === 'RESET_PASSWORD' ? new Date(now.getTime() + OTP_MS) : null,
				},
			});
			return true;
		});
		if (!verified)
			throw new BadRequestException('The confirmation code is invalid or expired');
		return grant;
	}

	private codeHash(id: string, code: string) {
		return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
			.update(id + ':' + code)
			.digest('hex');
	}
}
