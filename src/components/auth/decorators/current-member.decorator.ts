import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { ApiContext } from '../../../libs/types/request';

export const SignedInMember = createParamDecorator(
	(_: unknown, context: ExecutionContext) =>
		GqlExecutionContext.create(context).getContext<ApiContext>().req.member,
);
