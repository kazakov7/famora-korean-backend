import { Query, Resolver } from '@nestjs/graphql';
import { DailyPractice } from '../../libs/dto/daily-practice/daily-practice';
import { DailyPracticeService } from './daily-practice.service';

@Resolver()
export class DailyPracticeResolver {
	constructor(private readonly dailyPractice: DailyPracticeService) {}

	@Query(() => DailyPractice, { nullable: true })
	getDailyPractice() {
		return this.dailyPractice.today();
	}
}
