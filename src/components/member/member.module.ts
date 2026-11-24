import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { MemberResolver } from './member.resolver';
import { MemberService } from './member.service';

@Module({
	imports: [AuthModule, MediaModule],
	providers: [MemberResolver, MemberService],
})
export class MemberModule {}
