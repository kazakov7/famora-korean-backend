import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OidcProvider } from './oidc';

@Injectable()
export class TelegramProvider {
	constructor(private readonly config: ConfigService) {}

	settings(): OidcProvider {
		return {
			issuer: 'https://oauth.telegram.org',
			authorizationUrl: 'https://oauth.telegram.org/auth',
			tokenUrl: 'https://oauth.telegram.org/token',
			jwksUrl: 'https://oauth.telegram.org/.well-known/jwks.json',
			clientId: this.config.getOrThrow<string>('TELEGRAM_CLIENT_ID'),
			clientSecret: this.config.getOrThrow<string>('TELEGRAM_CLIENT_SECRET'),
			scopes: 'openid profile',
			usesNonce: false,
		};
	}
}
