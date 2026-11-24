import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
	async onModuleInit() {
		await this.$connect();
	}

	async onModuleDestroy() {
		await this.$disconnect();
	}

	async serial<T>(work: (client: Prisma.TransactionClient) => Promise<T>): Promise<T> {
		for (let index = 0; ; index += 1) {
			try {
				return await this.$transaction(work, {
					isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
					timeout: 15000,
				});
			} catch (error) {
				if (
					!(error instanceof Prisma.PrismaClientKnownRequestError) ||
					error.code !== 'P2034' ||
					index === 4
				) {
					throw error;
				}
			}
		}
	}
}
