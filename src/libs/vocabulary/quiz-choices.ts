import { createHash } from 'node:crypto';
import { SectionKind } from '@prisma/client';

export function translationKey(value: string) {
	return value
		.normalize('NFKC')
		.replace(/[‘’ʻʼ‛\x60´]/gu, "'")
		.trim()
		.replace(/\s+/gu, ' ')
		.toLowerCase();
}

export function quizChoices<T extends { id: string; correct: boolean }>(
	attemptId: string,
	section: SectionKind,
	choices: T[],
): T[] {
	if (section !== SectionKind.VOCABULARY) return choices;
	// A published choice and an attempt have stable IDs, including after a pause.
	const ordered = choices
		.map((choice) => ({
			choice,
			rank: createHash('sha256')
				.update(attemptId + ':' + choice.id)
				.digest('hex'),
		}))
		.sort((left, right) => left.rank.localeCompare(right.rank));
	const distractors = new Set(
		ordered
			.filter(({ choice }) => !choice.correct)
			.slice(0, 3)
			.map(({ choice }) => choice.id),
	);
	return ordered
		.filter(({ choice }) => choice.correct || distractors.has(choice.id))
		.map(({ choice }) => choice);
}
