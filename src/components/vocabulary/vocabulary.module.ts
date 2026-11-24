import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { VocabularyCatalogResolver, VocabularyResolver } from './vocabulary.resolver';
import { VocabularyService } from './vocabulary.service';

@Module({
	imports: [AuthModule, CatalogModule],
	providers: [VocabularyResolver, VocabularyCatalogResolver, VocabularyService],
})
export class VocabularyModule {}
