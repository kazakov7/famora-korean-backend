import { translationKey } from './quiz-choices';

export type VocabularyWord = { term: string; translation: string };
export type VocabularyQuestion = VocabularyWord & { distractors: string[] };

const maxDistractors = 11;

export function vocabularyTermKey(term: string) {
	return translationKey(term).replace(/\s+\d+$/u, '');
}

function printedSenses(translation: string) {
	const key = translationKey(translation);
	const primary = key
		.replace(/\([^()]*\)/gu, ' ')
		.split(/[/;,]/u)
		.map(translationKey)
		.filter(Boolean);
	return new Set([key, ...primary]);
}

export function vocabularyQuizBuilder(words: VocabularyWord[]) {
	const meaningsByTerm = new Map<string, Set<string>>();
	const sensesByTranslation = new Map<string, Set<string>>();
	for (const { term, translation } of words) {
		const termKey = vocabularyTermKey(term);
		const senses = printedSenses(translation);
		sensesByTranslation.set(translation, senses);
		const meanings = meaningsByTerm.get(termKey) ?? new Set<string>();
		for (const sense of senses) meanings.add(sense);
		meaningsByTerm.set(termKey, meanings);
	}

	return (unit: VocabularyWord[]): VocabularyQuestion[] =>
		unit.map((word, index) => {
			const nearby = [...unit.slice(index + 1), ...unit.slice(0, index)];
			const usedMeanings = new Set(meaningsByTerm.get(vocabularyTermKey(word.term)));
			const distractors: string[] = [];
			function addCandidates(candidates: VocabularyWord[]) {
				for (const { translation } of candidates) {
					if (distractors.length >= maxDistractors) break;
					const senses =
						sensesByTranslation.get(translation) ?? printedSenses(translation);
					if ([...senses].some((sense) => usedMeanings.has(sense))) continue;
					distractors.push(translation);
					for (const sense of senses) usedMeanings.add(sense);
				}
			}
			addCandidates(nearby);
			if (distractors.length < 3) addCandidates(words);
			return { ...word, distractors };
		});
}

export function vocabularyChoiceRows({ translation, distractors }: VocabularyQuestion) {
	return [translation, ...distractors].map((text, index) => ({
		text,
		sortOrder: index,
		correct: index === 0,
	}));
}
