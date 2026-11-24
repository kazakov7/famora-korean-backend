import type { AuthMethod, MemberRole } from '@prisma/client';
import type { Request, Response } from 'express';

export interface CurrentMember {
	memberId: string;
	sessionId: string;
	method: AuthMethod;
	role: MemberRole;
}

export interface AuthRequest extends Request {
	member?: CurrentMember;
	cookies: Record<string, string | undefined>;
}

export interface ApiContext {
	req: AuthRequest;
	res: Response;
}
