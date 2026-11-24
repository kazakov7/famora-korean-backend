import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { PageInput } from '../../libs/dto/common/page.input';
import { MediaService } from '../media/media.service';

type RankedMember = {
	id: string;
	memberNick: string;
	memberPoints: number;
	providerImageUrl: string | null;
	key: string | null;
	uploadedAt: Date | null;
	rank: number;
};

@Injectable()
export class LeaderboardService {
	constructor(
		private readonly db: PrismaService,
		private readonly media: MediaService,
	) {}

	async list(page: PageInput) {
		const [rows, total] = await this.db.$transaction([
			this.db.$queryRaw<
				RankedMember[]
			>`SELECT "members"."id", "memberNick", "memberPoints", "providerImageUrl", "media_assets"."key", "media_assets"."uploadedAt",
				(RANK() OVER (ORDER BY "memberPoints" DESC))::int AS rank
				FROM "members" LEFT JOIN "media_assets" ON "members"."memberImageId" = "media_assets"."id"
				ORDER BY "memberPoints" DESC, "memberNickKey" ASC
				OFFSET ${page.offset} LIMIT ${page.limit}`,
			this.db.member.count(),
		]);
		const list = await Promise.all(
			rows.map(
				async ({
					id,
					memberNick,
					memberPoints,
					providerImageUrl,
					rank,
					key,
					uploadedAt,
				}) => ({
					id,
					memberNick,
					memberPoints,
					rank,
					memberImage:
						(key ? await this.media.url({ key, uploadedAt }) : null) ?? providerImageUrl,
				}),
			),
		);
		return { list, total };
	}
}
