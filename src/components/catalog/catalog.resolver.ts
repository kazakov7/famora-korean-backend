import { Args, Query, Resolver } from '@nestjs/graphql';
import { ExamFamily, ExamLanguage, Menu } from '../../libs/dto/catalog/menu';
import { CatalogService } from './catalog.service';

@Resolver()
export class CatalogResolver {
	constructor(private readonly catalog: CatalogService) {}

	@Query(() => [Menu])
	getNavigation() {
		return this.catalog.navigation();
	}

	@Query(() => [ExamLanguage])
	getExamLanguages() {
		return this.catalog.languages();
	}

	@Query(() => [ExamFamily])
	getExamFamilies(@Args('languageCode') languageCode: string) {
		return this.catalog.families(languageCode);
	}
}
