import { registerEnumType } from '@nestjs/graphql';
import {
	AttemptStatus,
	AuthMethod,
	ExamKind,
	MemberRole,
	QuestionKind,
	SectionKind,
	SubmissionReason,
} from '@prisma/client';

for (const [name, value] of Object.entries({
	AttemptStatus,
	AuthMethod,
	ExamKind,
	MemberRole,
	QuestionKind,
	SectionKind,
	SubmissionReason,
})) {
	registerEnumType(value, { name });
}
