import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, link, mkdir, rename, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export type AssetFile = {
	name: string;
	path: string;
	contentType: string;
	sizeBytes: number;
};
export const imagePattern = /^[a-f0-9]{64}\.webp$/;
export const audioPattern = /^[a-f0-9]{64}\.mp3$/;

export function requireData(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

export async function inspectAsset(directory: string, name: string): Promise<AssetFile> {
	requireData(
		imagePattern.test(name) || audioPattern.test(name),
		'Invalid media filename',
	);
	const path = resolve(directory, name);
	const metadata = await stat(path);
	requireData(
		metadata.isFile() && metadata.size > 0 && metadata.size <= 2147483647,
		'Invalid media size for ' + name,
	);
	const file = createReadStream(path);
	const hash = createHash('sha256');
	for await (const chunk of file) hash.update(chunk);
	requireData(
		name.startsWith(hash.digest('hex') + '.'),
		'Media digest does not match for ' + name,
	);
	return {
		name,
		path,
		contentType: audioPattern.test(name) ? 'audio/mpeg' : 'image/webp',
		sizeBytes: metadata.size,
	};
}

export function examMediaStorage(directory: string, prefix = 'official-topik/') {
	if (process.env.TOPIK_MEDIA_STORAGE === 'local') {
		const localPath = process.env.EXAM_MEDIA_DIR;
		requireData(localPath, 'Set EXAM_MEDIA_DIR to the local media directory');
		const localDirectory = resolve(localPath);
		return {
			prefix: 'local-official/',
			async upload(files: AssetFile[]) {
				if (localDirectory === directory) return;
				await mkdir(localDirectory, { recursive: true });
				for (const file of files) {
					const destination = resolve(localDirectory, file.name);
					try {
						await link(file.path, destination);
					} catch (error) {
						const code = (error as NodeJS.ErrnoException).code;
						if (code === 'EXDEV') {
							const temporary = destination + '.' + randomUUID() + '.tmp';
							try {
								await copyFile(file.path, temporary);
								await rename(temporary, destination);
							} finally {
								await rm(temporary, { force: true });
							}
						} else if (code === 'EEXIST') {
							await inspectAsset(localDirectory, file.name);
						} else {
							throw error;
						}
					}
				}
			},
		};
	}
	const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
		process.env;
	requireData(
		R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET,
		'Configure Cloudflare R2 or explicitly choose TOPIK_MEDIA_STORAGE=local',
	);
	const client = new S3Client({
		region: 'auto',
		endpoint: 'https://' + R2_ACCOUNT_ID + '.r2.cloudflarestorage.com',
		credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
		requestChecksumCalculation: 'WHEN_REQUIRED',
		responseChecksumValidation: 'WHEN_REQUIRED',
	});
	return {
		prefix,
		async upload(files: AssetFile[]) {
			for (const file of files) {
				await client.send(
					new PutObjectCommand({
						Bucket: R2_BUCKET,
						Key: prefix + file.name,
						Body: createReadStream(file.path),
						ContentLength: file.sizeBytes,
						ContentType: file.contentType,
						CacheControl: 'private, max-age=900',
					}),
				);
			}
		},
	};
}
