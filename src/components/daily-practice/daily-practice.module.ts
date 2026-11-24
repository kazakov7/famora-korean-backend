import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ExamModule } from '../exam/exam.module';
import { DailyPracticeResolver } from './daily-practice.resolver';
import { DailyPracticeService } from './daily-practice.service';

@Module({
	imports: [CatalogModule, ExamModule],
	providers: [DailyPracticeService, DailyPracticeResolver],
})
export class DailyPracticeModule {}
