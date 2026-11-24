import type { Prisma } from '@prisma/client';

export const DAILY_PRACTICE_TIME_ZONE = 'Asia/Tashkent';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
	timeZone: DAILY_PRACTICE_TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
});

export function practiceDate(now = new Date()) {
	const parts = dayFormat.formatToParts(now);
	const year = parts.find(({ type }) => type === 'year')?.value;
	const month = parts.find(({ type }) => type === 'month')?.value;
	const day = parts.find(({ type }) => type === 'day')?.value;
	return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

export function availableExamDay(now?: Date): Pick<Prisma.ExamWhereInput, 'OR'> {
	return { OR: [{ dailyPracticeDate: null }, { dailyPracticeDate: practiceDate(now) }] };
}
