import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
	CopyObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { MediaAsset, Prisma } from '@prisma/client';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import type { PageInput } from '../../libs/dto/common/page.input';
import type { MediaUploadInput } from '../../libs/dto/media/media.input';
import type { CurrentMember } from '../../libs/types/request';

const localMediaKey = /^local-official\/([a-f0-9]{64}\.(?:mp3|webp))$/;

@Injectable()
export class MediaService {
	private client?: S3Client;

	constructor(
		private readonly db: PrismaService,
		private readonly config: ConfigService,
	) {}

	async createUpload(member: CurrentMember, input: MediaUploadInput) {
		const image = input.contentType.startsWith('image/');
		if (!image && member.role !== 'ADMIN')
			throw new ForbiddenException('Audio upload requires an administrator');
		if (image && input.sizeBytes > 10 * 1024 * 1024)
			throw new BadRequestException('Images may be up to 10 MB');
		const id = randomUUID();
		const key = 'staging/' + id;
		const { client, bucket } = this.storage();
		const uploadUrl = await getSignedUrl(
			client,
			new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: input.contentType }),
			{ expiresIn: 300 },
		);
		await this.db.mediaAsset.create({
			data: { id, key, ownerId: member.memberId, ...input },
		});
		return { id, uploadUrl, contentType: input.contentType };
	}

	async completeUpload(member: CurrentMember, id: string) {
		const asset = await this.db.mediaAsset.findFirst({
			where: { id, ownerId: member.memberId },
		});
		if (!asset) throw new NotFoundException('Upload not found');
		if (asset.uploadedAt) return this.display(asset);
		const { client, bucket } = this.storage();
		const pendingKey = 'staging/' + id;
		const object = await client
			.send(new HeadObjectCommand({ Bucket: bucket, Key: pendingKey }))
			.catch(() => null);
		if (
			!object ||
			object.ContentType !== asset.contentType ||
			object.ContentLength !== asset.sizeBytes ||
			!object.ETag
		) {
			throw new BadRequestException(
				'Upload is missing or does not match the declared file',
			);
		}
		const key = 'assets/' + id + '/' + object.ETag.replace(/[^a-zA-Z0-9-]/g, '');
		await client.send(
			new CopyObjectCommand({
				Bucket: bucket,
				Key: key,
				CopySource: bucket + '/' + pendingKey,
				CopySourceIfMatch: object.ETag,
			}),
		);
		await this.db.mediaAsset.updateMany({
			where: { id, uploadedAt: null },
			data: { key, uploadedAt: new Date() },
		});
		const uploaded = await this.db.mediaAsset.findUniqueOrThrow({ where: { id } });
		return this.display(uploaded);
	}

	async list(page: PageInput) {
		const where = { uploadedAt: { not: null } };
		const [items, total] = await this.db.$transaction([
			this.db.mediaAsset.findMany({
				where,
				skip: page.offset,
				take: page.limit,
				orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
			}),
			this.db.mediaAsset.count({ where }),
		]);
		return { list: await Promise.all(items.map((item) => this.display(item))), total };
	}

	async requireAsset(
		db: Prisma.TransactionClient,
		id: string,
		type: 'image' | 'audio',
		ownerId?: string,
	) {
		const found = await db.mediaAsset.findFirst({
			where: {
				id,
				uploadedAt: { not: null },
				contentType: { startsWith: type + '/' },
				ownerId,
			},
		});
		if (!found) throw new BadRequestException('Select an uploaded ' + type);
		return found;
	}

	async url(asset?: Pick<MediaAsset, 'key' | 'uploadedAt'> | null) {
		if (!asset?.uploadedAt) return null;
		const local = localMediaKey.exec(asset.key);
		if (local?.[1]) {
			if (!this.config.get<string>('EXAM_MEDIA_DIR'))
				throw new ServiceUnavailableException(
					'Local exam media storage is not configured',
				);
			const filename = local[1];
			const expires = String(Math.floor(Date.now() / 1000) + 6 * 60 * 60);
			const signature = this.localMediaSignature(filename, expires);
			return (
				'/api/exam-media/' + filename + '?expires=' + expires + '&signature=' + signature
			);
		}
		const { client, bucket } = this.storage();
		return getSignedUrl(
			client,
			new GetObjectCommand({ Bucket: bucket, Key: asset.key }),
			{ expiresIn: 15 * 60 },
		);
	}

	localMediaDirectory(filename: string, expires: string, signature: string) {
		const directory = this.config.get<string>('EXAM_MEDIA_DIR');
		if (
			!directory ||
			!localMediaKey.test('local-official/' + filename) ||
			!/^\d{10}$/.test(expires) ||
			Number(expires) <= Math.floor(Date.now() / 1000) ||
			!/^([a-f0-9]{64})$/.test(signature)
		) {
			throw new NotFoundException('Exam media not found');
		}
		const expected = this.localMediaSignature(filename, expires);
		if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex')))
			throw new NotFoundException('Exam media not found');
		return resolve(directory);
	}

	private localMediaSignature(filename: string, expires: string) {
		return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
			.update('exam-media:' + filename + ':' + expires)
			.digest('hex');
	}

	private async display(asset: MediaAsset) {
		return {
			id: asset.id,
			contentType: asset.contentType,
			sizeBytes: asset.sizeBytes,
			durationMs: asset.durationMs,
			url: await this.url(asset),
		};
	}

	private storage() {
		const bucket = this.config.get<string>('R2_BUCKET');
		const account = this.config.get<string>('R2_ACCOUNT_ID');
		const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
		const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
		if (!bucket || !account || !accessKeyId || !secretAccessKey)
			throw new ServiceUnavailableException('Cloudflare R2 storage is not configured');
		this.client ??= new S3Client({
			region: 'auto',
			endpoint: 'https://' + account + '.r2.cloudflarestorage.com',
			credentials: { accessKeyId, secretAccessKey },
			requestChecksumCalculation: 'WHEN_REQUIRED',
			responseChecksumValidation: 'WHEN_REQUIRED',
		});
		return { client: this.client, bucket };
	}
}
