import { ConfigService } from '@nestjs/config';

export function validateEnvironment(values: Record<string, unknown>) {
	for (const key of ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL', 'PUBLIC_API_URL']) {
		if (typeof values[key] !== 'string' || !values[key]) {
			throw new Error('Missing environment setting ' + key);
		}
	}
	if (String(values.JWT_SECRET).length < 32) {
		throw new Error('JWT_SECRET must contain at least 32 characters');
	}
	for (const key of ['PUBLIC_API_URL', 'FRONTEND_URL']) {
		const url = new URL(String(values[key]));
		if (
			url.pathname !== '/' ||
			url.search ||
			url.hash ||
			!['http:', 'https:'].includes(url.protocol)
		) {
			throw new Error(key + ' must be an HTTP origin');
		}
	}
	const port = Number(values.PORT ?? 4000);
	if (!Number.isInteger(port) || port < 1 || port > 65535)
		throw new Error('Invalid PORT');
	return { ...values, PORT: port };
}

export function applicationOrigin(
	config: ConfigService,
	key: 'PUBLIC_API_URL' | 'FRONTEND_URL',
) {
	return new URL(config.getOrThrow<string>(key)).origin;
}
