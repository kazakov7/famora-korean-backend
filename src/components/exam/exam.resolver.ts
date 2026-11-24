import { Args, Query, Resolver } from '@nestjs/graphql';
import { PageInput } from '../../libs/dto/common/page.input';
import { ExamOverview, ExamPage } from '../../libs/dto/exam/exam';
import { ExamFilterInput } from '../../libs/dto/exam/exam.input';
import { ExamService } from './exam.service';

@Resolver()
export class ExamResolver {
	constructor(private readonly exams: ExamService) {}

	@Query(() => ExamOverview)
	getExamOverview(@Args('slug') slug: string) {
		return this.exams.overview(slug);
	}

	@Query(() => ExamPage)
	getExamCatalog(
		@Args('page') page: PageInput,
		@Args('filter', { type: () => ExamFilterInput, nullable: true })
		filter?: ExamFilterInput,
	) {
		return this.exams.list(page, filter);
	}
}
