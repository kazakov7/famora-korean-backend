import { Args, Query, Resolver } from '@nestjs/graphql';
import { PageInput } from '../../libs/dto/common/page.input';
import { LeaderboardPage } from '../../libs/dto/leaderboard/leaderboard';
import { LeaderboardService } from './leaderboard.service';

@Resolver()
export class LeaderboardResolver {
	constructor(private readonly leaderboard: LeaderboardService) {}

	@Query(() => LeaderboardPage)
	getLeaderboard(@Args('page') page: PageInput) {
		return this.leaderboard.list(page);
	}
}
