import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { AuthThrottleService } from './auth-throttle.service';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { OtpService } from './otp.service';
import { GoogleProvider } from './providers/google.provider';
import { OidcService } from './providers/oidc';
import { TelegramProvider } from './providers/telegram.provider';
import { SessionService } from './session.service';

@Module({
	imports: [
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				secret: config.getOrThrow<string>('JWT_SECRET'),
			}),
		}),
	],
	controllers: [AuthController],
	providers: [
		AuthResolver,
		AuthService,
		SessionService,
		AuthThrottleService,
		OtpService,
		AuthGuard,
		RolesGuard,
		OidcService,
		GoogleProvider,
		TelegramProvider,
	],
	exports: [AuthGuard, RolesGuard, SessionService],
})
export class AuthModule {}
