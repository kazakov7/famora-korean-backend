import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ScheduleModule } from '@nestjs/schedule';
import { AttemptModule } from './components/attempt/attempt.module';
import { AuthModule } from './components/auth/auth.module';
import { LeaderboardModule } from './components/leaderboard/leaderboard.module';
import { VocabularyModule } from './components/vocabulary/vocabulary.module';
import { MediaModule } from './components/media/media.module';
import { MemberModule } from './components/member/member.module';
import { CatalogModule } from './components/catalog/catalog.module';
import { DailyPracticeModule } from './components/daily-practice/daily-practice.module';
import { ExamModule } from './components/exam/exam.module';
import { DatabaseModule } from './database/database.module';
import { validateEnvironment } from './libs/config/environment';
import type { ApiContext } from './libs/types/request';
import './libs/enums/graphql.enums';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
		GraphQLModule.forRoot<ApolloDriverConfig>({
			driver: ApolloDriver,
			autoSchemaFile: true,
			sortSchema: true,
			introspection: process.env.NODE_ENV !== 'production',
			includeStacktraceInErrorResponses: false,
			context: ({ req, res }: ApiContext) => ({ req, res }),
		}),
		ScheduleModule.forRoot(),
		DatabaseModule,
		AuthModule,
		MediaModule,
		MemberModule,
		CatalogModule,
		ExamModule,
		AttemptModule,
		LeaderboardModule,
		VocabularyModule,
		DailyPracticeModule,
	],
})
export class AppModule {}
