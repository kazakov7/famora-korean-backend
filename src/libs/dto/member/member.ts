import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { AuthMethod, MemberRole } from '@prisma/client';

@ObjectType()
export class Member {
	@Field(() => ID)
	id!: string;

	@Field()
	memberNick!: string;

	@Field()
	memberFullName!: string;

	@Field(() => String, { nullable: true })
	memberImage?: string | null;

	@Field(() => String, { nullable: true })
	memberPhone?: string | null;

	@Field(() => Int, { nullable: true })
	memberAge?: number | null;

	@Field(() => AuthMethod)
	memberAuthType!: AuthMethod;

	@Field(() => AuthMethod)
	authMethod!: AuthMethod;

	@Field(() => MemberRole)
	role!: MemberRole;

	@Field(() => Int)
	memberPoints!: number;

	@Field(() => String, { nullable: true })
	recoveryEmail?: string | null;

	@Field(() => [AuthMethod])
	providers!: AuthMethod[];

	@Field()
	hasPassword!: boolean;

	@Field()
	showGmailNotice!: boolean;
}
