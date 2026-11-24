import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { applicationOrigin } from './libs/config/environment';

export async function createApp() {
	const app = await NestFactory.create(AppModule);
	const config = app.get(ConfigService);
	app.use(cookieParser());
	app.enableCors({
		origin: applicationOrigin(config, 'FRONTEND_URL'),
		credentials: true,
	});
	app.useGlobalPipes(
		new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
	);
	app.enableShutdownHooks();
	return app;
}

async function bootstrap() {
	const app = await createApp();
	await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
}

if (require.main === module) void bootstrap();
