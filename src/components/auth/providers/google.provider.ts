import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OidcProvider } from './oidc';

@Injectable()
export class GoogleProvider {
	constructor(private readonly config: ConfigService) {}

	settings(): OidcProvider {
		return {
			issuer: 'https://accounts.google.com',
			authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
			tokenUrl: 'https://oauth2.googleapis.com/token',
			jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
			clientId: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
			clientSecret: this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
			scopes: 'openid email profile',
			usesNonce: true,
		};
	}
}
