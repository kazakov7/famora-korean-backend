import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { MediaModule } from '../media/media.module';
import { AdminExamResolver } from './admin-exam.resolver';
import { ExamResolver } from './exam.resolver';
import { ExamService } from './exam.service';

@Module({
	imports: [AuthModule, CatalogModule, MediaModule],
	providers: [ExamService, ExamResolver, AdminExamResolver],
	exports: [ExamService],
})
export class ExamModule {}
