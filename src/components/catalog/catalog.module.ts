import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminCatalogResolver } from './admin-catalog.resolver';
import { CatalogResolver } from './catalog.resolver';
import { CatalogService } from './catalog.service';

@Module({
	imports: [AuthModule],
	providers: [CatalogService, CatalogResolver, AdminCatalogResolver],
	exports: [CatalogService],
})
export class CatalogModule {}
