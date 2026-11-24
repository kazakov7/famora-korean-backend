import { Reflector } from '@nestjs/core';
import { MemberRole } from '@prisma/client';

export const Roles = Reflector.createDecorator<MemberRole[]>();
