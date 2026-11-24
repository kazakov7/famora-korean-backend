import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthMethod } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { PrismaService } from '../../database/prisma.service';
import type { AuthRequest, CurrentMember } from '../../libs/types/request';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACCESS_COOKIE = 'quiz_access';
const REFRESH_COOKIE = 'quiz_refresh';

export function digest(data: string) {
	return createHash('sha256').update(data).digest('hex');
}

export function equalDigest(a: string, b: string) {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	return left.length === right.length && timingSafeEqual(left, right);
}

@Injectable()
export class SessionService {
	constructor(
		private readonly db: PrismaService,
		private readonly config: ConfigService,
		private readonly jwt: JwtService,
	) {}

	cookieOptions(): CookieOptions {
		return {
			httpOnly: true,
			sameSite: 'lax',
			secure: this.config.get('NODE_ENV') === 'production',
			path: '/',
		};
	}

	async open(memberId: string, method: AuthMethod, res: Response) {
		const secret = randomBytes(32).toString('base64url');
		const { id, expiresAt } = await this.db.authSession.create({
			data: {
				memberId,
				method,
				refreshHash: digest(secret),
				expiresAt: new Date(Date.now() + DAY_MS * 7),
			},
		});
		await this.setCookies(memberId, id, secret, expiresAt, res);
	}

	async current(req: AuthRequest): Promise<CurrentMember | undefined> {
		const token = req.cookies?.[ACCESS_COOKIE];
		if (!token) return;
		let claims: { sub: string; sid: string };
		try {
			claims = await this.jwt.verifyAsync(token, {
				algorithms: ['HS256'],
				audience: 'quiz-web',
				issuer: 'quiz-api',
			});
		} catch {
			return;
		}
		const session = await this.db.authSession.findFirst({
			where: {
				id: claims.sid,
				memberId: claims.sub,
				revokedAt: null,
				expiresAt: { gt: new Date() },
			},
			include: { member: { select: { role: true } } },
		});
		if (!session) return;
		return {
			sessionId: session.id,
			memberId: session.memberId,
			method: session.method,
			role: session.member.role,
		};
	}

	async refresh(req: AuthRequest, res: Response) {
		const parsed = this.readRefresh(req);
		if (!parsed) throw new UnauthorizedException('Session expired');
		const { id, secret } = parsed;
		const replacement = randomBytes(32).toString('base64url');
		const session = await this.db.authSession.findUnique({ where: { id } });
		if (
			!session ||
			session.revokedAt ||
			session.expiresAt <= new Date() ||
			!equalDigest(session.refreshHash, digest(secret))
		) {
			throw new UnauthorizedException('Session expired');
		}
		const { count } = await this.db.authSession.updateMany({
			where: {
				id,
				refreshHash: session.refreshHash,
				revokedAt: null,
				expiresAt: { gt: new Date() },
			},
			data: { refreshHash: digest(replacement) },
		});
		if (!count) throw new UnauthorizedException('Session refresh already used');
		await this.setCookies(session.memberId, id, replacement, session.expiresAt, res);
		return true;
	}

	async logout(req: AuthRequest, res: Response) {
		const current = await this.current(req);
		const refresh = this.readRefresh(req);
		if (current) {
			await this.db.authSession.updateMany({
				where: { id: current.sessionId },
				data: { revokedAt: new Date() },
			});
		} else if (refresh) {
			await this.db.authSession.updateMany({
				where: { id: refresh.id, refreshHash: digest(refresh.secret) },
				data: { revokedAt: new Date() },
			});
		}
		res.clearCookie(ACCESS_COOKIE, this.cookieOptions());
		res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
		return true;
	}

	private readRefresh(req: AuthRequest) {
		const [id, secret] = req.cookies?.[REFRESH_COOKIE]?.split('.') ?? [];
		if (
			!id ||
			!secret ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
		)
			return;
		return { id, secret };
	}

	private async setCookies(
		memberId: string,
		id: string,
		secret: string,
		expiresAt: Date,
		res: Response,
	) {
		const accessToken = await this.jwt.signAsync(
			{ sub: memberId, sid: id },
			{
				audience: 'quiz-web',
				issuer: 'quiz-api',
				algorithm: 'HS256',
				expiresIn: '2d',
			},
		);
		res.cookie(ACCESS_COOKIE, accessToken, {
			...this.cookieOptions(),
			maxAge: DAY_MS * 2,
		});
		res.cookie(REFRESH_COOKIE, id + '.' + secret, {
			...this.cookieOptions(),
			expires: expiresAt,
		});
	}
}
