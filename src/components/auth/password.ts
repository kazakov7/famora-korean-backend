import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

function derive(password: string, salt: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(password, salt, 64, (error, key) => {
			if (error) reject(error);
			else resolve(key);
		});
	});
}

export async function hashPassword(password: string) {
	const salt = randomBytes(16).toString('hex');
	return salt + ':' + (await derive(password, salt)).toString('hex');
}

export async function checkPassword(password: string, stored?: string) {
	const [salt, digest] = stored?.split(':') ?? [];
	const supplied = await derive(password, salt ?? 'quiz-missing-credential');
	if (!digest) return false;
	const expected = Buffer.from(digest, 'hex');
	return expected.length === supplied.length && timingSafeEqual(supplied, expected);
}
