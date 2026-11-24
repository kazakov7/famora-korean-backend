import { Field, Int, ObjectType } from '@nestjs/graphql';
import { ExamOverview } from '../exam/exam';

@ObjectType()
export class DailyPractice {
	@Field()
	date!: string;

	@Field(() => Int)
	questionCount!: number;

	@Field(() => ExamOverview)
	exam!: ExamOverview;
}
