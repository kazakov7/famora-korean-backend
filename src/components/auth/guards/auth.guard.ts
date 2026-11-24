import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { ApiContext } from '../../../libs/types/request';
import { SessionService } from '../session.service';

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(private readonly sessions: SessionService) {}

	async canActivate(context: ExecutionContext) {
		const { req } = GqlExecutionContext.create(context).getContext<ApiContext>();
		req.member = await this.sessions.current(req);
		if (!req.member) throw new UnauthorizedException('Sign in to continue');
		return true;
	}
}
