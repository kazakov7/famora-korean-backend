import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Prisma, SectionKind } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { PageInput } from '../../libs/dto/common/page.input';
import type {
	CreateExamInput,
	ExamDraftInput,
	ExamFilterInput,
	QuestionGroupInput,
	QuestionInput,
	SectionInput,
	VariantInput,
} from '../../libs/dto/exam/exam.input';
import type { ExamOverview } from '../../libs/dto/exam/exam';
import { translationKey } from '../../libs/vocabulary/quiz-choices';
import { CatalogService } from '../catalog/catalog.service';
import { MediaService } from '../media/media.service';

const versionContent = {
	variants: {
		orderBy: { sortOrder: 'asc' },
		include: {
			sections: {
				orderBy: { sortOrder: 'asc' },
				include: {
					groups: true,
					questions: {
						orderBy: { sortOrder: 'asc' },
						include: { choices: { orderBy: { sortOrder: 'asc' } } },
					},
				},
			},
		},
	},
} satisfies Prisma.ExamVersionInclude;

const adminExamInclude = {
	versions: { orderBy: { number: 'desc' } },
	menus: { select: { menuId: true } },
} satisfies Prisma.ExamInclude;

const publicVersion = {
	currentVersion: {
		include: {
			cover: true,
			variants: {
				orderBy: { sortOrder: 'asc' },
				include: {
					sections: {
						orderBy: { sortOrder: 'asc' },
						select: { kind: true, title: true, durationSeconds: true },
					},
				},
			},
		},
	},
} satisfies Prisma.ExamInclude;

type VersionContent = Prisma.ExamVersionGetPayload<{ include: typeof versionContent }>;

@Injectable()
export class ExamService {
	constructor(
		private readonly db: PrismaService,
		private readonly catalog: CatalogService,
		private readonly media: MediaService,
	) {}

	async overview(slug: string, dailyPracticeDate: Date | null = null) {
		const exam = await this.db.exam.findFirst({
			where: { ...this.visible(), slug, dailyPracticeDate },
			include: publicVersion,
		});
		if (!exam) throw new NotFoundException('Exam not found');
		return this.publicExam(exam);
	}

	async list(page: PageInput, filter?: ExamFilterInput) {
		const where: Prisma.ExamWhereInput = {
			...this.visible(),
			dailyPracticeDate: null,
			kind: filter?.kind ?? undefined,
			languageCode: filter?.languageCode ?? undefined,
			currentVersion: filter?.search
				? { title: { contains: filter.search, mode: 'insensitive' } }
				: undefined,
		};
		if (filter?.menuSlug) {
			const menu = (await this.catalog.navigation()).find(
				({ slug }) => slug === filter.menuSlug,
			);
			if (!menu) return { list: [], total: 0 };
			const [items, total] = await this.db.$transaction([
				this.db.examMenuLink.findMany({
					where: { menuId: menu.id, exam: where },
					skip: page.offset,
					take: page.limit,
					orderBy: [{ sortOrder: 'asc' }, { examId: 'asc' }],
					include: { exam: { include: publicVersion } },
				}),
				this.db.examMenuLink.count({ where: { menuId: menu.id, exam: where } }),
			]);
			return {
				list: await Promise.all(items.map(({ exam }) => this.publicExam(exam))),
				total,
			};
		}
		const [items, total] = await this.db.$transaction([
			this.db.exam.findMany({
				where,
				skip: page.offset,
				take: page.limit,
				include: publicVersion,
				orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
			}),
			this.db.exam.count({ where }),
		]);
		return { list: await Promise.all(items.map((exam) => this.publicExam(exam))), total };
	}

	async adminList(page: PageInput) {
		const [items, total] = await this.db.$transaction([
			this.db.exam.findMany({
				skip: page.offset,
				take: page.limit,
				orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
				include: adminExamInclude,
			}),
			this.db.exam.count(),
		]);
		return {
			list: items.map(({ menus, ...exam }) => ({
				...exam,
				menuIds: menus.map(({ menuId }) => menuId),
			})),
			total,
		};
	}

	async adminExam(id: string) {
		const exam = await this.db.exam.findUnique({
			where: { id },
			include: adminExamInclude,
		});
		if (!exam) throw new NotFoundException('Exam not found');
		return { ...exam, menuIds: exam.menus.map(({ menuId }) => menuId) };
	}

	async adminVersion(id: string) {
		const version = await this.db.examVersion.findUnique({
			where: { id },
			include: versionContent,
		});
		if (!version) throw new NotFoundException('Exam version not found');
		return version;
	}

	async create(input: CreateExamInput) {
		const { slug, kind, languageCode, familyId, ...draft } = input;
		const id = await this.edit(async (tx) => {
			const language = await tx.examLanguage.findUnique({
				where: { code: languageCode },
			});
			if (!language?.active)
				throw new BadRequestException('Choose an active exam language');
			if (familyId) {
				const family = await tx.examFamily.findFirst({
					where: { id: familyId, languageCode },
				});
				if (!family)
					throw new BadRequestException(
						'The exam family does not belong to the selected language',
					);
			}
			await this.validateHeader(tx, draft);
			const created = await tx.exam.create({
				data: {
					slug,
					kind,
					languageCode,
					familyId,
					versions: { create: { ...draft, number: 1 } },
				},
			});
			return created.id;
		});
		return this.adminExam(id);
	}

	async archive(id: string, archived: boolean) {
		await this.db.exam.updateMany({
			where: { id },
			data: { archivedAt: archived ? new Date() : null },
		});
		return this.adminExam(id);
	}

	async createDraft(examId: string) {
		const id = await this.edit(async (tx) => {
			const exam = await tx.exam.findUnique({
				where: { id: examId },
				include: { currentVersion: { include: versionContent } },
			});
			if (!exam) throw new NotFoundException('Exam not found');
			const latest = await tx.examVersion.findFirst({
				where: { examId },
				orderBy: { number: 'desc' },
			});
			if (!latest) throw new NotFoundException('Exam version not found');
			if (!latest.publishedAt) return latest.id;
			const source = exam.currentVersion;
			if (!source)
				throw new BadRequestException(
					'Publish the first draft before creating a revision',
				);
			const draft = await tx.examVersion.create({
				data: {
					examId,
					number: latest.number + 1,
					title: source.title,
					description: source.description,
					durationSeconds: source.durationSeconds,
					coverId: source.coverId,
				},
			});
			for (const {
				id: oldVariantId,
				versionId,
				sections,
				...variantFields
			} of source.variants) {
				void oldVariantId;
				void versionId;
				const variant = await tx.examVariant.create({
					data: { ...variantFields, versionId: draft.id },
				});
				for (const {
					id: oldSectionId,
					variantId,
					groups,
					questions,
					...sectionFields
				} of sections) {
					void oldSectionId;
					void variantId;
					const section = await tx.examSection.create({
						data: { ...sectionFields, variantId: variant.id },
					});
					const groupIds = new Map<string, string>();
					for (const { id, sectionId, ...groupFields } of groups) {
						void sectionId;
						const group = await tx.questionGroup.create({
							data: { ...groupFields, sectionId: section.id },
						});
						groupIds.set(id, group.id);
					}
					for (const {
						id: oldQuestionId,
						sectionId,
						groupId,
						choices,
						...questionFields
					} of questions) {
						void oldQuestionId;
						void sectionId;
						await tx.question.create({
							data: {
								...questionFields,
								sectionId: section.id,
								groupId: groupId ? groupIds.get(groupId) : null,
								choices: {
									create: choices.map(({ text, imageId, sortOrder, correct }) => ({
										text,
										imageId,
										sortOrder,
										correct,
									})),
								},
							},
						});
					}
				}
			}
			return draft.id;
		});
		return this.adminVersion(id);
	}

	async updateDraft(id: string, input: ExamDraftInput) {
		await this.edit(async (tx) => {
			await this.draftVersion(tx, id);
			await this.validateHeader(tx, input);
			await tx.examVersion.update({
				where: { id },
				data: {
					...input,
					description: input.description ?? null,
					coverId: input.coverId ?? null,
				},
			});
		});
		return this.adminVersion(id);
	}

	async publish(id: string) {
		const examId = await this.edit(async (tx) => {
			const version = await tx.examVersion.findUnique({
				where: { id },
				include: { ...versionContent, exam: true },
			});
			if (!version) throw new NotFoundException('Exam version not found');
			if (version.publishedAt) {
				if (version.exam.currentVersionId === id) return version.examId;
				throw new ConflictException('This revision has already been published');
			}
			if (!version.variants.length)
				throw new BadRequestException('Add at least one variant');
			if (version.exam.kind === 'OFFICIAL' && version.variants.length !== 1) {
				throw new BadRequestException(
					'An official exam must contain one original variant',
				);
			}
			if (
				version.exam.kind === 'VOCABULARY' &&
				(version.variants.length !== 1 || version.variants[0]?.sections.length !== 1)
			) {
				throw new BadRequestException(
					'A vocabulary unit must contain one variant and one section',
				);
			}
			for (const variant of version.variants) {
				for (const section of variant.sections) {
					if ((section.kind === 'VOCABULARY') !== (version.exam.kind === 'VOCABULARY'))
						throw new BadRequestException(
							'Vocabulary units require a vocabulary section',
						);
				}
			}
			for (const variant of version.variants) this.validateVariant(variant);
			await tx.examVersion.update({ where: { id }, data: { publishedAt: new Date() } });
			await tx.exam.update({
				where: { id: version.examId },
				data: { currentVersionId: id },
			});
			return version.examId;
		});
		return this.adminExam(examId);
	}

	saveVariant(versionId: string, id: string | undefined, input: VariantInput) {
		return this.edit(async (tx) => {
			await this.draftVersion(tx, versionId);
			if (!input.label.trim()) throw new BadRequestException('Variant label is required');
			if (id) {
				const { count } = await tx.examVariant.updateMany({
					where: { id, versionId },
					data: input,
				});
				if (!count) throw new NotFoundException('Variant not found');
				return id;
			}
			return (await tx.examVariant.create({ data: { ...input, versionId } })).id;
		});
	}

	deleteVariant(versionId: string, id: string) {
		return this.edit(async (tx) => {
			await this.draftVersion(tx, versionId);
			await tx.examVariant.deleteMany({ where: { id, versionId } });
			return true;
		});
	}

	saveSection(variantId: string, id: string | undefined, input: SectionInput) {
		return this.edit(async (tx) => {
			await this.draftVariant(tx, variantId);
			const data = {
				...input,
				title: input.title ?? null,
				instructions: input.instructions ?? null,
				audioMaxPlays: input.audioMaxPlays ?? null,
			};
			if (id) {
				const { count } = await tx.examSection.updateMany({
					where: { id, variantId },
					data,
				});
				if (!count) throw new NotFoundException('Section not found');
				return id;
			}
			return (await tx.examSection.create({ data: { ...data, variantId } })).id;
		});
	}

	deleteSection(variantId: string, id: string) {
		return this.edit(async (tx) => {
			await this.draftVariant(tx, variantId);
			await tx.examSection.deleteMany({ where: { id, variantId } });
			return true;
		});
	}

	saveGroup(sectionId: string, id: string | undefined, input: QuestionGroupInput) {
		return this.edit(async (tx) => {
			await this.draftSection(tx, sectionId);
			if (input.imageId) await this.media.requireAsset(tx, input.imageId, 'image');
			const audio = input.audioId
				? await this.media.requireAsset(tx, input.audioId, 'audio')
				: null;
			const { audioStartMs, audioEndMs, audioMaxPlays } = input;
			if (
				!audio &&
				(audioStartMs != null || audioEndMs != null || audioMaxPlays != null)
			) {
				throw new BadRequestException('Select audio for the playback settings');
			}
			if (
				(audioEndMs != null && audioEndMs <= (audioStartMs ?? 0)) ||
				(audio?.durationMs &&
					((audioEndMs ?? 0) > audio.durationMs ||
						(audioStartMs ?? 0) >= audio.durationMs))
			) {
				throw new BadRequestException('Invalid audio segment');
			}
			const data = {
				passage: input.passage ?? null,
				imageId: input.imageId ?? null,
				audioId: input.audioId ?? null,
				audioStartMs: audioStartMs ?? null,
				audioEndMs: audioEndMs ?? null,
				audioMaxPlays: audioMaxPlays ?? null,
			};
			if (id) {
				const { count } = await tx.questionGroup.updateMany({
					where: { id, sectionId },
					data,
				});
				if (!count) throw new NotFoundException('Group not found');
				return id;
			}
			return (await tx.questionGroup.create({ data: { ...data, sectionId } })).id;
		});
	}

	deleteGroup(sectionId: string, id: string) {
		return this.edit(async (tx) => {
			await this.draftSection(tx, sectionId);
			await tx.questionGroup.deleteMany({ where: { id, sectionId } });
			return true;
		});
	}

	saveQuestion(sectionId: string, id: string | undefined, input: QuestionInput) {
		return this.edit(async (tx) => {
			const section = await this.draftSection(tx, sectionId);
			const { choices, ...fields } = input;
			if (!input.prompt.trim() && !input.imageId)
				throw new BadRequestException('Question text or image required');
			if (
				input.kind === 'CHOICE' &&
				(choices.length < 2 || choices.filter(({ correct }) => correct).length !== 1)
			) {
				throw new BadRequestException(
					'Provide at least two choices and exactly one correct choice',
				);
			}
			if (
				input.kind === 'TEXT' &&
				(section.kind !== 'WRITING' ||
					choices.length ||
					!input.sampleAnswer?.trim() ||
					!input.explanation?.trim())
			) {
				throw new BadRequestException('Writing requires a sample answer and explanation');
			}
			if (
				input.groupId &&
				!(await tx.questionGroup.findFirst({ where: { id: input.groupId, sectionId } }))
			) {
				throw new BadRequestException('Question group must belong to this section');
			}
			if (input.imageId) await this.media.requireAsset(tx, input.imageId, 'image');
			for (const choice of choices) {
				if (!choice.text?.trim() && !choice.imageId)
					throw new BadRequestException('Choices need text or an image');
				if (choice.imageId) await this.media.requireAsset(tx, choice.imageId, 'image');
			}
			const data = {
				...fields,
				imageId: input.imageId ?? null,
				groupId: input.groupId ?? null,
				explanation: input.explanation ?? null,
				sampleAnswer: input.sampleAnswer ?? null,
			};
			const choiceRows = choices.map((choice, sortOrder) => ({ ...choice, sortOrder }));
			if (id) {
				const { count } = await tx.question.updateMany({
					where: { id, sectionId },
					data,
				});
				if (!count) throw new NotFoundException('Question not found');
				await tx.choice.deleteMany({ where: { questionId: id } });
				if (choiceRows.length)
					await tx.choice.createMany({
						data: choiceRows.map((row) => ({ ...row, questionId: id })),
					});
				return id;
			}
			const question = await tx.question.create({
				data: { ...data, sectionId, choices: { create: choiceRows } },
			});
			return question.id;
		});
	}

	deleteQuestion(sectionId: string, id: string) {
		return this.edit(async (tx) => {
			await this.draftSection(tx, sectionId);
			await tx.question.deleteMany({ where: { id, sectionId } });
			return true;
		});
	}

	private async draftVersion(tx: Prisma.TransactionClient, id: string) {
		const version = await tx.examVersion.findUnique({ where: { id } });
		if (!version) throw new NotFoundException('Exam version not found');
		if (version.publishedAt)
			throw new ConflictException('Create a draft to change published content');
		return version;
	}

	private async draftVariant(tx: Prisma.TransactionClient, id: string) {
		const variant = await tx.examVariant.findUnique({
			where: { id },
			include: { version: true },
		});
		if (!variant) throw new NotFoundException('Variant not found');
		if (variant.version.publishedAt)
			throw new ConflictException('Create a draft to change published content');
		return variant;
	}

	private async draftSection(tx: Prisma.TransactionClient, id: string) {
		const section = await tx.examSection.findUnique({
			where: { id },
			include: { variant: { include: { version: true } } },
		});
		if (!section) throw new NotFoundException('Section not found');
		if (section.variant.version.publishedAt)
			throw new ConflictException('Create a draft to change published content');
		return section;
	}

	private async validateHeader(tx: Prisma.TransactionClient, input: ExamDraftInput) {
		if (!input.title.trim()) throw new BadRequestException('Exam title is required');
		if (input.coverId) await this.media.requireAsset(tx, input.coverId, 'image');
	}

	private validateVariant(variant: VersionContent['variants'][number]) {
		if (!variant.sections.length)
			throw new BadRequestException('Every variant needs at least one section');
		for (const section of variant.sections) {
			if (!section.questions.length)
				throw new BadRequestException('Every section needs questions');
			if (section.kind === 'VOCABULARY') {
				if (section.questions.length > 30)
					throw new BadRequestException('A vocabulary unit can contain up to 30 words');
				for (const question of section.questions) {
					const labels = question.choices.map(({ text }) => translationKey(text ?? ''));
					if (
						question.kind !== 'CHOICE' ||
						!question.prompt.trim() ||
						labels.length < 4 ||
						labels.includes('') ||
						new Set(labels).size !== labels.length ||
						question.choices.filter(({ correct }) => correct).length !== 1
					)
						throw new BadRequestException(
							'Each vocabulary word needs four distinct written choices and one correct translation',
						);
				}
			}
			if (section.kind === 'LISTENING') {
				const groups = new Map(section.groups.map((group) => [group.id, group]));
				for (const question of section.questions) {
					const group = question.groupId ? groups.get(question.groupId) : undefined;
					if (!group?.audioId || !(group.audioMaxPlays ?? section.audioMaxPlays)) {
						throw new BadRequestException(
							'Listening questions need audio and a playback limit',
						);
					}
				}
			}
		}
	}

	private visible(): Prisma.ExamWhereInput {
		return {
			archivedAt: null,
			currentVersionId: { not: null },
			language: { active: true },
		};
	}

	private async publicExam(
		exam: Prisma.ExamGetPayload<{ include: typeof publicVersion }>,
	): Promise<ExamOverview> {
		const version = exam.currentVersion;
		if (!version) throw new NotFoundException('Exam not found');
		const sections = new Map<SectionKind, ExamOverview['sections'][number]>();
		for (const variant of version.variants) {
			for (const section of variant.sections)
				if (!sections.has(section.kind)) sections.set(section.kind, section);
		}
		return {
			id: exam.id,
			slug: exam.slug,
			kind: exam.kind,
			languageCode: exam.languageCode,
			title: version.title,
			description: version.description,
			durationSeconds: version.durationSeconds,
			coverUrl: await this.media.url(version.cover),
			sections: [...sections.values()],
		};
	}

	private async edit<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
		try {
			return await this.db.serial(work);
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === 'P2002'
			) {
				throw new ConflictException(
					'The slug, section kind, or position is already in use',
				);
			}
			throw error;
		}
	}
}
