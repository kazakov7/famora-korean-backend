import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { ExamMenuInput, MenuInput } from '../../libs/dto/catalog/menu.input';

@Injectable()
export class CatalogService {
	constructor(private readonly db: PrismaService) {}

	async navigation(client: Prisma.TransactionClient = this.db) {
		const menus = await client.menu.findMany({
			where: { published: true },
			orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
		});
		const byParent = new Map<string | null, typeof menus>();
		for (const menu of menus) {
			const siblings = byParent.get(menu.parentId);
			if (siblings) siblings.push(menu);
			else byParent.set(menu.parentId, [menu]);
		}
		const visible = [...(byParent.get(null) ?? [])];
		for (let index = 0; index < visible.length; index += 1) {
			const menu = visible[index];
			if (menu) visible.push(...(byParent.get(menu.id) ?? []));
		}
		return visible;
	}

	languages() {
		return this.db.examLanguage.findMany({
			where: { active: true },
			orderBy: { code: 'asc' },
		});
	}

	families(languageCode: string) {
		return this.db.examFamily.findMany({
			where: { languageCode, language: { active: true } },
			orderBy: { key: 'asc' },
		});
	}

	adminMenus() {
		return this.db.menu.findMany({ orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }] });
	}

	async saveMenu(input: MenuInput) {
		const { id, parentId, name, ...rest } = input;
		if (!name.trim()) throw new BadRequestException('A menu name is required');
		try {
			return await this.db.serial(async (tx) => {
				if (id) {
					const menu = await tx.menu.findUnique({ where: { id } });
					if (!menu) throw new NotFoundException('Menu not found');
					if (menu.systemKey) throw new BadRequestException('System menus are fixed');
				}
				let ancestorId = parentId;
				while (ancestorId) {
					if (ancestorId === id)
						throw new BadRequestException('A menu cannot be its own ancestor');
					const ancestor = await tx.menu.findUnique({
						where: { id: ancestorId },
						select: { parentId: true },
					});
					if (!ancestor) throw new NotFoundException('Parent menu not found');
					ancestorId = ancestor.parentId;
				}
				const data = { ...rest, name, parentId: parentId ?? null };
				return id ? tx.menu.update({ where: { id }, data }) : tx.menu.create({ data });
			});
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
				throw new ConflictException('This menu slug is already in use');
			throw error;
		}
	}

	async deleteMenu(id: string) {
		return this.db.serial(async (tx) => {
			const menu = await tx.menu.findUnique({
				where: { id },
				include: { _count: { select: { children: true } } },
			});
			if (!menu) throw new NotFoundException('Menu not found');
			if (menu.systemKey) throw new BadRequestException('System menus are fixed');
			if (menu._count.children)
				throw new BadRequestException('Move the child menus first');
			await tx.menu.delete({ where: { id } });
			return true;
		});
	}

	async setExamMenu(input: ExamMenuInput) {
		const { examId, menuId, sortOrder } = input;
		return this.db.serial(async (tx) => {
			const [exam, menu] = await Promise.all([
				tx.exam.findUnique({ where: { id: examId } }),
				tx.menu.findUnique({ where: { id: menuId } }),
			]);
			if (!exam || !menu) throw new NotFoundException('Exam or menu not found');
			await tx.examMenuLink.upsert({
				where: { examId_menuId: { examId, menuId } },
				create: input,
				update: { sortOrder },
			});
			return true;
		});
	}

	async removeExamMenu(examId: string, menuId: string) {
		await this.db.examMenuLink.deleteMany({ where: { examId, menuId } });
		return true;
	}
}
