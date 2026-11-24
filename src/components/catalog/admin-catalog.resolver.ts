import { ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Menu } from '../../libs/dto/catalog/menu';
import { ExamMenuInput, MenuInput } from '../../libs/dto/catalog/menu.input';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CatalogService } from './catalog.service';

@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(['ADMIN'])
export class AdminCatalogResolver {
	constructor(private readonly catalog: CatalogService) {}

	@Query(() => [Menu])
	getAdminMenus() {
		return this.catalog.adminMenus();
	}

	@Mutation(() => Menu)
	saveMenu(@Args('input') input: MenuInput) {
		return this.catalog.saveMenu(input);
	}

	@Mutation(() => Boolean)
	deleteMenu(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
		return this.catalog.deleteMenu(id);
	}

	@Mutation(() => Boolean)
	setExamMenu(@Args('input') input: ExamMenuInput) {
		return this.catalog.setExamMenu(input);
	}

	@Mutation(() => Boolean)
	removeExamMenu(
		@Args('examId', { type: () => ID }, ParseUUIDPipe) examId: string,
		@Args('menuId', { type: () => ID }, ParseUUIDPipe) menuId: string,
	) {
		return this.catalog.removeExamMenu(examId, menuId);
	}
}
