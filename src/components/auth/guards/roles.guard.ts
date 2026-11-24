import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { MemberRole } from '@prisma/client';
import type { ApiContext } from '../../../libs/types/request';
import { Roles } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext) {
		const roles = this.reflector.getAllAndOverride<MemberRole[]>(Roles, [
			context.getHandler(),
			context.getClass(),
		]);
		const member =
			GqlExecutionContext.create(context).getContext<ApiContext>().req.member;
		if (!roles || !member || !roles.includes(member.role))
			throw new ForbiddenException('Required role is missing');
		return true;
	}
}
