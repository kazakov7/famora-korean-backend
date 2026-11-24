import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { digest } from './session.service';

@Injectable()
export class AuthThrottleService {
	constructor(private readonly db: PrismaService) {}

	async take(scope: string, value: string, limit: number, periodMs: number) {
		const key = digest(scope + ':' + value);
		const allowed = await this.db.serial(async (tx) => {
			const now = new Date();
			const previous = await tx.authThrottle.findUnique({ where: { key } });
			if (previous && previous.expiresAt > now && previous.hits >= limit) return false;
			const oldWindow = previous && previous.expiresAt > now;
			const data = {
				hits: oldWindow ? previous.hits + 1 : 1,
				expiresAt: oldWindow ? previous.expiresAt : new Date(now.getTime() + periodMs),
			};
			await tx.authThrottle.upsert({
				where: { key },
				create: { key, ...data },
				update: data,
			});
			return true;
		});
		if (!allowed)
			throw new HttpException(
				'Too many requests. Try again later.',
				HttpStatus.TOO_MANY_REQUESTS,
			);
	}
}
