import { Field, ID, InputType } from '@nestjs/graphql';
import { IsString, IsUUID, Length, Matches } from 'class-validator';

@InputType()
export class NicknameInput {
	@Field()
	@IsString()
	@Length(3, 32)
	@Matches(/^[\p{L}\p{N}_]+$/u)
	nickname!: string;
}

@InputType()
export class NicknameLoginInput extends NicknameInput {
	@Field()
	@IsString()
	@Length(1, 128)
	password!: string;
}

@InputType()
export class SignupInput extends NicknameInput {
	@Field()
	@IsString()
	@Length(8, 128)
	password!: string;

	@Field()
	@IsString()
	@Length(1, 120)
	fullName!: string;
}

@InputType()
export class NewPasswordInput {
	@Field()
	@IsString()
	@Length(8, 128)
	password!: string;
}

@InputType()
export class ChangePasswordInput extends NewPasswordInput {
	@Field()
	@IsString()
	@Length(1, 128)
	oldPassword!: string;
}

@InputType()
export class VerifyOtpInput {
	@Field(() => ID)
	@IsUUID()
	challengeId!: string;

	@Field()
	@Matches(/^\d{6}$/)
	code!: string;
}

@InputType()
export class ResetPasswordInput extends NewPasswordInput {
	@Field(() => ID)
	@IsUUID()
	challengeId!: string;

	@Field()
	@IsString()
	@Length(40, 128)
	grant!: string;
}
