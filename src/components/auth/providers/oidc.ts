import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, createPublicKey, verify } from 'node:crypto';
import type { JsonWebKey } from 'node:crypto';
import { decode } from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';

export interface OidcProvider {
	issuer: string;
	authorizationUrl: string;
	tokenUrl: string;
	jwksUrl: string;
	clientId: string;
	clientSecret: string;
	scopes: string;
	usesNonce: boolean;
}

interface ProfileClaims extends JwtPayload {
	name?: string;
	picture?: string;
	preferred_username?: string;
	email?: string;
	email_verified?: boolean;
}

export interface ProviderProfile {
	subject: string;
	name?: string;
	username?: string;
	email?: string;
	emailVerified: boolean;
	picture?: string;
}

interface ExchangeInput {
	code: string;
	verifier: string;
	redirectUri: string;
	nonce: string;
}

type SigningKey = JsonWebKey & { kid?: string; alg?: string };

@Injectable()
export class OidcService {
	private readonly jwks = new Map<string, { keys: SigningKey[]; expires: number }>();

	authorize(
		provider: OidcProvider,
		input: { state: string; nonce: string; verifier: string; redirectUri: string },
	) {
		const url = new URL(provider.authorizationUrl);
		url.search = new URLSearchParams({
			client_id: provider.clientId,
			redirect_uri: input.redirectUri,
			response_type: 'code',
			scope: provider.scopes,
			state: input.state,
			code_challenge: createHash('sha256').update(input.verifier).digest('base64url'),
			code_challenge_method: 'S256',
		}).toString();
		if (provider.usesNonce) url.searchParams.set('nonce', input.nonce);
		if (provider.usesNonce) url.searchParams.set('prompt', 'select_account');
		return url.toString();
	}

	async exchange(provider: OidcProvider, input: ExchangeInput): Promise<ProviderProfile> {
		const response = await this.request(provider.tokenUrl, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: provider.clientId,
				client_secret: provider.clientSecret,
				code: input.code,
				grant_type: 'authorization_code',
				redirect_uri: input.redirectUri,
				code_verifier: input.verifier,
			}),
		});
		const token = (await response.json()) as { id_token?: string };
		if (!token.id_token)
			throw new UnauthorizedException('Provider did not return a login identity');
		const decoded = decode(token.id_token, { complete: true });
		if (!decoded || !decoded.header.kid || typeof decoded.payload === 'string')
			throw new UnauthorizedException('Invalid provider identity');
		const cached = await this.keys(provider.jwksUrl);
		const key =
			cached.find((entry) => entry.kid === decoded.header.kid) ??
			(await this.keys(provider.jwksUrl, true)).find(
				(entry) => entry.kid === decoded.header.kid,
			);
		if (
			!key ||
			(key.alg && key.alg !== decoded.header.alg) ||
			!this.validSignature(token.id_token, key, decoded.header.alg)
		) {
			throw new UnauthorizedException('Invalid provider signature');
		}
		const claims = decoded.payload as ProfileClaims;
		const now = Math.floor(Date.now() / 1000);
		const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
		if (
			claims.iss !== provider.issuer ||
			!audience.includes(provider.clientId) ||
			typeof claims.exp !== 'number' ||
			claims.exp <= now ||
			typeof claims.iat !== 'number' ||
			claims.iat > now + 60 ||
			(typeof claims.nbf === 'number' && claims.nbf > now + 60) ||
			typeof claims.sub !== 'string' ||
			!claims.sub ||
			(provider.usesNonce && claims.nonce !== input.nonce)
		) {
			throw new UnauthorizedException('Provider identity is invalid or expired');
		}
		return {
			subject: claims.sub,
			name: typeof claims.name === 'string' ? claims.name : undefined,
			username:
				typeof claims.preferred_username === 'string'
					? claims.preferred_username
					: undefined,
			email: typeof claims.email === 'string' ? claims.email : undefined,
			emailVerified: claims.email_verified === true,
			picture:
				typeof claims.picture === 'string' && claims.picture.startsWith('https://')
					? claims.picture
					: undefined,
		};
	}

	private validSignature(token: string, key: SigningKey, algorithm: string) {
		const algorithms: Record<string, string | null> = {
			RS256: 'RSA-SHA256',
			ES256: 'sha256',
			ES256K: 'sha256',
			EdDSA: null,
		};
		const signer = algorithms[algorithm];
		if (signer === undefined) return false;
		const signatureStart = token.lastIndexOf('.');
		const options = {
			key: createPublicKey({ format: 'jwk', key }),
			dsaEncoding: 'ieee-p1363' as const,
		};
		return verify(
			signer,
			Buffer.from(token.slice(0, signatureStart)),
			options,
			Buffer.from(token.slice(signatureStart + 1), 'base64url'),
		);
	}

	private async keys(url: string, force = false) {
		const cached = this.jwks.get(url);
		if (!force && cached && cached.expires > Date.now()) return cached.keys;
		const response = await this.request(url);
		const body = (await response.json()) as { keys: SigningKey[] };
		this.jwks.set(url, { keys: body.keys, expires: Date.now() + 5 * 60 * 1000 });
		return body.keys;
	}

	private async request(url: string, init?: RequestInit) {
		const response = await fetch(url, {
			...init,
			signal: AbortSignal.timeout(8000),
			redirect: 'error',
		});
		if (!response.ok)
			throw new BadGatewayException('Login provider did not complete the request');
		return response;
	}
}
