export function nicknameKey(nickname: string) {
	return nickname.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

export function automaticNickname(name: string, fallback: string) {
	const base = nicknameKey(name)
		.replace(/[^\p{L}\p{N}_]+/gu, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 22);
	return base.length >= 3 ? base : (base ? base + '_' + fallback : fallback).slice(0, 22);
}
