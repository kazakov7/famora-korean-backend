import { PrismaClient } from '@prisma/client';

async function grantAdmin() {
	const nickname = process.argv[2]?.trim().normalize('NFKC').toLocaleLowerCase('en-US');
	if (!nickname) throw new Error('Pass the nickname of an existing member');
	const db = new PrismaClient();
	try {
		await db.member.update({
			where: { memberNickKey: nickname },
			data: { role: 'ADMIN' },
		});
	} finally {
		await db.$disconnect();
	}
}

grantAdmin().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : 'Admin update failed');
	process.exitCode = 1;
});
