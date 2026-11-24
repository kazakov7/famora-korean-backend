import {
	BadRequestException,
	Controller,
	Get,
	Param,
	Query,
	Req,
	Res,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthMethod } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { applicationOrigin } from '../../libs/config/environment';
import type { AuthRequest } from '../../libs/types/request';
import { AuthService } from './auth.service';
import { AuthThrottleService } from './auth-throttle.service';
import { GoogleProvider } from './providers/google.provider';
import { OidcService } from './providers/oidc';
import { TelegramProvider } from './providers/telegram.provider';
import { SessionService } from './session.service';

const STATE_COOKIE = 'quiz_oauth';
const FLOW_MS = 10 * 60 * 1000;

@Controller('auth')
export class AuthController {
	constructor(
		private readonly config: ConfigService,
		private readonly db: PrismaService,
		private readonly auth: AuthService,
		private readonly sessions: SessionService,
		private readonly throttle: AuthThrottleService,
		private readonly oidc: OidcService,
		private readonly google: GoogleProvider,
		private readonly telegram: TelegramProvider,
	) {}

	@Get(':provider/start')
	async start(
		@Param('provider') provider: string,
		@Query('returnTo') returnTo: string | undefined,
		@Query('link') link: string | undefined,
		@Req() req: AuthRequest,
		@Res() res: Response,
	) {
		await this.throttle.take('oauth-start', req.ip ?? 'unknown', 40, FLOW_MS);
		const method = this.method(provider);
		const candidate = link === 'true' ? await this.sessions.current(req) : undefined;
		if (link === 'true' && !candidate)
			throw new UnauthorizedException('Sign in to link a provider');
		const settings = this.settings(method);
		const id = randomBytes(32).toString('base64url');
		const verifier = randomBytes(48).toString('base64url');
		const nonce = randomBytes(32).toString('base64url');
		const target = this.safeReturnTo(returnTo, candidate ? '/uz/my' : '/uz');
		await this.db.oAuthFlow.create({
			data: {
				id,
				method,
				verifier,
				nonce,
				memberId: candidate?.memberId,
				returnTo: target,
				expiresAt: new Date(Date.now() + FLOW_MS),
			},
		});
		res.cookie(STATE_COOKIE, id, { ...this.sessions.cookieOptions(), maxAge: FLOW_MS });
		res.redirect(
			this.oidc.authorize(settings, {
				state: id,
				nonce,
				verifier,
				redirectUri: this.redirectUri(provider),
			}),
		);
	}

	@Get(':provider/callback')
	async callback(
		@Param('provider') provider: string,
		@Query('code') code: string | undefined,
		@Query('state') state: string | undefined,
		@Req() req: AuthRequest,
		@Res() res: Response,
	) {
		const method = this.method(provider);
		const origin = applicationOrigin(this.config, 'FRONTEND_URL');
		res.clearCookie(STATE_COOKIE, this.sessions.cookieOptions());
		let destination = new URL('/uz/account/login', origin);
		try {
			if (
				typeof code !== 'string' ||
				typeof state !== 'string' ||
				state !== req.cookies?.[STATE_COOKIE]
			)
				throw new UnauthorizedException('Invalid provider session');
			const flow = await this.db.oAuthFlow.findUnique({ where: { id: state } });
			if (!flow || flow.method !== method || flow.expiresAt <= new Date())
				throw new UnauthorizedException('Provider session expired');
			const removed = await this.db.oAuthFlow.deleteMany({ where: { id: state } });
			if (!removed.count)
				throw new UnauthorizedException('Provider session already used');
			destination = new URL(flow.returnTo, origin);
			if (
				flow.memberId &&
				flow.memberId !== (await this.sessions.current(req))?.memberId
			) {
				throw new UnauthorizedException('Sign in again to link this provider');
			}
			const profile = await this.oidc.exchange(this.settings(method), {
				code,
				verifier: flow.verifier,
				nonce: flow.nonce,
				redirectUri: this.redirectUri(provider),
			});
			if (method === AuthMethod.GOOGLE && flow.memberId) {
				const challengeId = await this.auth.linkGoogle(flow.memberId, profile);
				destination.searchParams.set('gmailChallenge', challengeId);
			} else {
				const memberId = await this.auth.socialLogin(
					method,
					profile,
					flow.memberId ?? undefined,
				);
				await this.sessions.open(memberId, method, res);
			}
		} catch {
			destination.searchParams.set('error', 'oauth_failed');
		}
		res.redirect(destination.toString());
	}

	private method(provider: string) {
		if (provider === 'google') return AuthMethod.GOOGLE;
		if (provider === 'telegram') return AuthMethod.TELEGRAM;
		throw new BadRequestException('Unknown login provider');
	}

	private settings(method: AuthMethod) {
		return method === AuthMethod.GOOGLE
			? this.google.settings()
			: this.telegram.settings();
	}

	private redirectUri(provider: string) {
		return (
			applicationOrigin(this.config, 'PUBLIC_API_URL') + '/auth/' + provider + '/callback'
		);
	}

	private safeReturnTo(value: string | undefined, fallback: string) {
		if (typeof value !== 'string' || !value.startsWith('/') || value.length > 1000)
			return fallback;
		const origin = applicationOrigin(this.config, 'FRONTEND_URL');
		const target = new URL(value, origin);
		return target.origin === origin
			? target.pathname + target.search + target.hash
			: fallback;
	}
}
