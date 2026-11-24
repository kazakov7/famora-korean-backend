import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { ScoringModule } from '../scoring/scoring.module';
import { AttemptExpirationJob } from './attempt-expiration.job';
import { AttemptResolver } from './attempt.resolver';
import { AttemptService } from './attempt.service';

@Module({
	imports: [AuthModule, MediaModule, ScoringModule],
	providers: [AttemptResolver, AttemptService, AttemptExpirationJob],
})
export class AttemptModule {}
