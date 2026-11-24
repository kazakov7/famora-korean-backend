import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { UpdateMemberInput } from '../../libs/dto/member/member.input';
import type { CurrentMember } from '../../libs/types/request';
import { nicknameKey } from '../auth/nickname';
import { MediaService } from '../media/media.service';

@Injectable()
export class MemberService {
	constructor(
		private readonly db: PrismaService,
		private readonly media: MediaService,
	) {}

	async me(current: CurrentMember) {
		const member = await this.db.member.findUniqueOrThrow({
			where: { id: current.memberId },
			include: {
				memberImage: true,
				identities: { select: { method: true } },
				credential: { select: { memberId: true } },
			},
		});
		return {
			id: member.id,
			memberNick: member.memberNick,
			memberFullName: member.memberFullName,
			memberImage: (await this.media.url(member.memberImage)) ?? member.providerImageUrl,
			memberPhone: member.memberPhone,
			memberAge: member.memberAge,
			memberAuthType: member.memberAuthType,
			authMethod: current.method,
			role: member.role,
			memberPoints: member.memberPoints,
			recoveryEmail: member.recoveryEmail,
			providers: member.identities.map(({ method }) => method),
			hasPassword: Boolean(member.credential),
			showGmailNotice: current.method === 'NICKNAME' && !member.recoveryEmail,
		};
	}

	async update(current: CurrentMember, input: UpdateMemberInput) {
		const fullName = input.fullName?.trim();
		if (input.fullName && !fullName) throw new BadRequestException('Enter a name');
		try {
			await this.db.$transaction(async (tx) => {
				if (input.imageId)
					await this.media.requireAsset(tx, input.imageId, 'image', current.memberId);
				await tx.member.update({
					where: { id: current.memberId },
					data: {
						memberNick: input.nickname ?? undefined,
						memberNickKey: input.nickname ? nicknameKey(input.nickname) : undefined,
						memberFullName: fullName,
						memberPhone: input.phone,
						memberAge: input.age,
						memberImageId: input.imageId,
					},
				});
			});
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
				throw new ConflictException('Nickname is already in use');
			throw error;
		}
		return this.me(current);
	}
}
