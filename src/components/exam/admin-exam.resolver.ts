import { ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { PageInput } from '../../libs/dto/common/page.input';
import { AdminExam, AdminExamPage, AdminExamVersion } from '../../libs/dto/exam/exam';
import {
	CreateExamInput,
	ExamDraftInput,
	QuestionGroupInput,
	QuestionInput,
	SectionInput,
	VariantInput,
} from '../../libs/dto/exam/exam.input';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ExamService } from './exam.service';

const optionalUuid = new ParseUUIDPipe({ optional: true });

@Resolver()
@UseGuards(AuthGuard, RolesGuard)
@Roles(['ADMIN'])
export class AdminExamResolver {
	constructor(private readonly exams: ExamService) {}

	@Query(() => AdminExamPage)
	getAdminExams(@Args('page') page: PageInput) {
		return this.exams.adminList(page);
	}

	@Query(() => AdminExam)
	getAdminExam(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
		return this.exams.adminExam(id);
	}

	@Query(() => AdminExamVersion)
	getAdminExamVersion(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
		return this.exams.adminVersion(id);
	}

	@Mutation(() => AdminExam)
	createExam(@Args('input') input: CreateExamInput) {
		return this.exams.create(input);
	}

	@Mutation(() => AdminExam)
	archiveExam(
		@Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
		@Args('archived') archived: boolean,
	) {
		return this.exams.archive(id, archived);
	}

	@Mutation(() => AdminExamVersion)
	createExamDraft(@Args('examId', { type: () => ID }, ParseUUIDPipe) examId: string) {
		return this.exams.createDraft(examId);
	}

	@Mutation(() => AdminExamVersion)
	updateExamDraft(
		@Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
		@Args('input') input: ExamDraftInput,
	) {
		return this.exams.updateDraft(id, input);
	}

	@Mutation(() => AdminExam)
	publishExamVersion(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
		return this.exams.publish(id);
	}

	@Mutation(() => ID)
	saveExamVariant(
		@Args('versionId', { type: () => ID }, ParseUUIDPipe) versionId: string,
		@Args('input') input: VariantInput,
		@Args('id', { type: () => ID, nullable: true }, optionalUuid) id?: string,
	) {
		return this.exams.saveVariant(versionId, id, input);
	}

	@Mutation(() => Boolean)
	deleteExamVariant(
		@Args('versionId', { type: () => ID }, ParseUUIDPipe) versionId: string,
		@Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
	) {
		return this.exams.deleteVariant(versionId, id);
	}

	@Mutation(() => ID)
	saveExamSection(
		@Args('variantId', { type: () => ID }, ParseUUIDPipe) variantId: string,
		@Args('input') input: SectionInput,
		@Args('id', { type: () => ID, nullable: true }, optionalUuid) id?: string,
	) {
		return this.exams.saveSection(variantId, id, input);
	}

	@Mutation(() => Boolean)
	deleteExamSection(
		@Args('variantId', { type: () => ID }, ParseUUIDPipe) variantId: string,
		@Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
	) {
		return this.exams.deleteSection(variantId, id);
	}

	@Mutation(() => ID)
	saveQuestionGroup(
		@Args('sectionId', { type: () => ID }, ParseUUIDPipe) sectionId: string,
		@Args('input') input: QuestionGroupInput,
		@Args('id', { type: () => ID, nullable: true }, optionalUuid) id?: string,
	) {
		return this.exams.saveGroup(sectionId, id, input);
	}

	@Mutation(() => Boolean)
	deleteQuestionGroup(
		@Args('sectionId', { type: () => ID }, ParseUUIDPipe) sectionId: string,
		@Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
	) {
		return this.exams.deleteGroup(sectionId, id);
	}

	@Mutation(() => ID)
	saveQuestion(
		@Args('sectionId', { type: () => ID }, ParseUUIDPipe) sectionId: string,
		@Args('input') input: QuestionInput,
		@Args('id', { type: () => ID, nullable: true }, optionalUuid) id?: string,
	) {
		return this.exams.saveQuestion(sectionId, id, input);
	}

	@Mutation(() => Boolean)
	deleteQuestion(
		@Args('sectionId', { type: () => ID }, ParseUUIDPipe) sectionId: string,
		@Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
	) {
		return this.exams.deleteQuestion(sectionId, id);
	}
}
