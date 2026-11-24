import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { LeaderboardResolver } from './leaderboard.resolver';
import { LeaderboardService } from './leaderboard.service';

@Module({ imports: [MediaModule], providers: [LeaderboardService, LeaderboardResolver] })
export class LeaderboardModule {}
