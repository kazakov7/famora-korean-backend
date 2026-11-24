import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AttemptService } from './attempt.service';

@Injectable()
export class AttemptExpirationJob {
	private readonly logger = new Logger(AttemptExpirationJob.name);

	constructor(private readonly attempts: AttemptService) {}

	@Cron('*/5 * * * * *', { waitForCompletion: true })
	async expire() {
		try {
			await this.attempts.expireDue();
		} catch (error) {
			this.logger.error(
				'Could not finalize expired attempts',
				error instanceof Error ? error.stack : undefined,
			);
		}
	}
}
