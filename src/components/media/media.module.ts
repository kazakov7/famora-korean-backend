import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExamMediaController } from './exam-media.controller';
import { MediaResolver } from './media.resolver';
import { MediaService } from './media.service';

@Module({
	imports: [AuthModule],
	controllers: [ExamMediaController],
	providers: [MediaResolver, MediaService],
	exports: [MediaService],
})
export class MediaModule {}
