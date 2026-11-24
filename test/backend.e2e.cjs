const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const net = require('node:net');
const { test } = require('node:test');
const { setTimeout: wait } = require('node:timers/promises');

async function smtpMailbox() {
	const messages = [];
	const sockets = new Set();
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.on('close', () => sockets.delete(socket));
		let buffer = '';
		let message = null;
		socket.setEncoding('utf8');
		socket.write('220 test-mail\r\n');
		socket.on('data', (incoming) => {
			buffer += incoming;
			for (let end; (end = buffer.indexOf('\r\n')) >= 0;) {
				const line = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);
				if (message !== null) {
					if (line === '.') {
						messages.push(message.join('\n'));
						message = null;
						socket.write('250 delivered\r\n');
					} else {
						message.push(line);
					}
				} else if (/^DATA$/i.test(line)) {
					message = [];
					socket.write('354 enter mail\r\n');
				} else if (/^QUIT$/i.test(line)) {
					socket.end('221 goodbye\r\n');
				} else {
					socket.write('250 OK\r\n');
				}
			}
		});
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	return {
		url: 'smtp://127.0.0.1:' + server.address().port,
		code(email) {
			const mail = messages.findLast((item) => item.includes(email));
			const code = mail?.match(/Confirmation code: (\d{6})/i)?.[1];
			assert.ok(code, 'The local mailbox must receive a code for ' + email);
			return code;
		},
		close() {
			for (const socket of sockets) socket.destroy();
			return new Promise((resolve) => server.close(resolve));
		},
	};
}

function browser(origin) {
	const cookies = new Map();
	async function request(path, init = {}) {
		const response = await fetch(origin + path, {
			...init,
			redirect: 'manual',
			headers: {
				...init.headers,
				cookie: [...cookies].map(([name, value]) => name + '=' + value).join('; '),
			},
		});
		for (const item of response.headers.getSetCookie()) {
			const [name, value] = item.split(';')[0].split('=');
			if (value) cookies.set(name, value);
			else cookies.delete(name);
		}
		return response;
	}
	async function graph(query, variables) {
		const response = await request('/graphql', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query, variables }),
		});
		return response.json();
	}
	return {
		request,
		graph,
		async ok(query, variables) {
			const body = await graph(query, variables);
			assert.equal(body.errors, undefined, JSON.stringify(body.errors));
			return body.data;
		},
		async rejects(query, variables) {
			const body = await graph(query, variables);
			assert.ok(body.errors?.length, 'The operation should fail: ' + query);
		},
	};
}

const signup = 'mutation ($input: SignupInput!) { signup(input: $input) }';
const login = 'mutation ($input: NicknameLoginInput!) { login(input: $input) }';
const me =
	'{ getMe { id memberNick memberAuthType authMethod memberPoints hasPassword showGmailNotice recoveryEmail } }';
const start =
	'mutation ($input: StartAttemptInput!) { startAttempt(input: $input) { id title mode status versionId variantId variantLabel remainingMs sections { kind groups { id hasAudio } questions { id prompt choices { id text } selectedChoiceId answerText } } } }';
const saveAnswer = 'mutation ($input: AnswerInput!) { saveAttemptAnswer(input: $input) }';
const pause =
	'mutation ($id: ID!) { pauseAttempt(id: $id) { id status remainingMs versionId } }';
const submit =
	'mutation ($id: ID!) { submitAttempt(id: $id) { status versionId score maxScore points review { prompt correctChoiceId explanation sampleAnswer answerText } } }';
const open = 'mutation ($id: ID!) { recordExamOpen(examId: $id) }';

async function social(browser, provider, link = false) {
	const response = await browser.request(
		'/auth/' + provider + '/start?returnTo=/uz/my&link=' + link,
	);
	assert.equal(response.status, 302);
	const destination = new URL(response.headers.get('location'));
	assert.equal(destination.searchParams.get('code_challenge_method'), 'S256');
	const state = destination.searchParams.get('state');
	assert.ok(state);
	const callback = await browser.request(
		'/auth/' + provider + '/callback?state=' + state + '&code=test',
	);
	assert.equal(callback.status, 302);
	const final = new URL(callback.headers.get('location'));
	assert.equal(final.pathname, '/uz/my');
	assert.equal(final.searchParams.get('error'), null);
	return final;
}

test(
	'PostgreSQL-backed GraphQL and browser login flows',
	{ skip: !process.env.TEST_DATABASE_URL, timeout: 45000 },
	async (t) => {
		const mailbox = await smtpMailbox();
		t.after(() => mailbox.close());
		Object.assign(process.env, {
			NODE_ENV: 'test',
			DATABASE_URL: process.env.TEST_DATABASE_URL,
			JWT_SECRET: randomBytes(40).toString('hex'),
			FRONTEND_URL: 'http://localhost:3000',
			PUBLIC_API_URL: 'http://localhost:4000',
			SMTP_URL: mailbox.url,
			MAIL_FROM: 'quiz@example.test',
			GOOGLE_CLIENT_ID: 'test-google',
			GOOGLE_CLIENT_SECRET: 'test-secret',
			TELEGRAM_CLIENT_ID: 'test-telegram',
			TELEGRAM_CLIENT_SECRET: 'test-secret',
			R2_ACCOUNT_ID: 'e2e',
			R2_ACCESS_KEY_ID: 'e2e',
			R2_SECRET_ACCESS_KEY: 'e2e',
			R2_BUCKET: 'e2e',
		});
		const { createApp } = require('../dist/main.js');
		const { PrismaService } = require('../dist/database/prisma.service.js');
		const { OidcService } = require('../dist/components/auth/providers/oidc.js');
		const app = await createApp();
		t.after(() => app.close());
		await app.listen(0, '127.0.0.1');
		const origin = await app.getUrl();
		const db = app.get(PrismaService);
		const uid = randomBytes(5).toString('hex');
		const student = browser(origin);
		const admin = browser(origin);
		const guest = browser(origin);
		const password = 'Test password 123';
		const nickname = 'student_' + uid;

		const catalog = await guest.ok('{ getNavigation { id systemKey } }');
		const topik = catalog.getNavigation.find((row) => row.systemKey === 'TOPIK_I');
		assert.ok(topik);
		await guest.rejects(me);
		await student.ok(signup, { input: { nickname, password, fullName: 'Student' } });
		await guest.rejects(signup, {
			input: { nickname: nickname.toUpperCase(), password, fullName: 'Duplicate' },
		});
		const profile = (await student.ok(me)).getMe;
		assert.equal(profile.showGmailNotice, true);
		await admin.ok(signup, {
			input: { nickname: 'admin_' + uid, password, fullName: 'Local admin' },
		});
		const adminId = (await admin.ok(me)).getMe.id;
		await db.member.update({ where: { id: adminId }, data: { role: 'ADMIN' } });

		const oidc = app.get(OidcService);
		oidc.exchange = async ({ issuer }) =>
			issuer.includes('telegram')
				? {
						subject: 'tg-' + uid,
						username: 'sample_' + uid,
						name: 'Sample',
						emailVerified: false,
					}
				: {
						subject: 'g-' + uid,
						name: 'Sample Google',
						email: 'quiz.' + uid + '@gmail.com',
						emailVerified: true,
					};
		const socialStudent = browser(origin);
		await social(socialStudent, 'telegram');
		assert.equal((await socialStudent.ok(me)).getMe.memberNick, 'sample_' + uid);
		assert.equal((await socialStudent.ok(me)).getMe.authMethod, 'TELEGRAM');
		await socialStudent.ok(
			'mutation { setFirstPassword(input: { password: "Social user password" }) }',
		);
		await socialStudent.rejects(
			'mutation { changePassword(input: { oldPassword: "Social user password", password: "Replacement password" }) }',
		);
		const googleNew = browser(origin);
		oidc.exchange = async () => ({
			subject: 'google-new-' + uid,
			name: 'Google Student',
			emailVerified: true,
		});
		await social(googleNew, 'google');
		assert.equal((await googleNew.ok(me)).getMe.authMethod, 'GOOGLE');
		let email = 'quiz.' + uid + '@gmail.com';
		oidc.exchange = async () => ({
			subject: 'g-' + uid,
			name: 'Sample Google',
			email,
			emailVerified: true,
		});
		const gmailTarget = await social(student, 'google', true);
		const challengeId = gmailTarget.searchParams.get('gmailChallenge');
		assert.ok(challengeId);
		const verify = 'mutation ($input: VerifyOtpInput!) { verifyGmailOtp(input: $input) }';
		await student.ok(verify, { input: { challengeId, code: mailbox.code(email) } });
		await student.rejects(verify, { input: { challengeId, code: mailbox.code(email) } });
		assert.equal((await student.ok(me)).getMe.showGmailNotice, false);
		email = 'replacement.' + uid + '@gmail.com';
		oidc.exchange = async () => ({
			subject: 'replacement-' + uid,
			name: 'Replacement Google account',
			email,
			emailVerified: true,
		});
		const replacement = await social(student, 'google', true);
		await student.ok(verify, {
			input: {
				challengeId: replacement.searchParams.get('gmailChallenge'),
				code: mailbox.code(email),
			},
		});
		assert.equal((await student.ok(me)).getMe.recoveryEmail, email);
		const resetRequest = await guest.ok(
			'mutation ($input: NicknameInput!) { requestPasswordReset(input: $input) }',
			{ input: { nickname } },
		);
		const resetId = resetRequest.requestPasswordReset;
		const resetOtp = await guest.ok(
			'mutation ($input: VerifyOtpInput!) { verifyPasswordResetOtp(input: $input) }',
			{ input: { challengeId: resetId, code: mailbox.code(email) } },
		);
		const newPassword = 'Reset student password';
		await guest.ok(
			'mutation ($input: ResetPasswordInput!) { resetPassword(input: $input) }',
			{
				input: {
					challengeId: resetId,
					grant: resetOtp.verifyPasswordResetOtp,
					password: newPassword,
				},
			},
		);
		await student.rejects(me);
		await student.rejects(login, { input: { nickname, password } });
		await student.ok(login, { input: { nickname, password: newPassword } });
		await student.ok('mutation { refreshSession }');
		assert.equal((await student.ok(me)).getMe.authMethod, 'NICKNAME');

		const saveMenu =
			'mutation ($input: MenuInput!) { saveMenu(input: $input) { id slug } }';
		const rootInput = {
			slug: 'practice-' + uid,
			name: '연습',
			sortOrder: 2,
			published: true,
		};
		const root = (await admin.ok(saveMenu, { input: rootInput })).saveMenu;
		const sub = (
			await admin.ok(saveMenu, {
				input: { ...rootInput, slug: 'sub-' + uid, parentId: root.id },
			})
		).saveMenu;
		await admin.rejects(saveMenu, {
			input: { ...rootInput, id: root.id, parentId: sub.id },
		});

		const exam = (
			await admin.ok(
				'mutation ($input: CreateExamInput!) { createExam(input: $input) { id slug versions { id } } }',
				{
					input: {
						slug: 'mock-' + uid,
						title: '첫 번째 시험',
						kind: 'MOCK',
						languageCode: 'ko',
						durationSeconds: 120,
					},
				},
			)
		).createExam;
		const versionId = exam.versions[0].id;
		await guest.rejects('{ getExamOverview(slug: "' + exam.slug + '") { id } }');
		for (const menuId of [topik.id, sub.id]) {
			await admin.ok('mutation ($input: ExamMenuInput!) { setExamMenu(input: $input) }', {
				input: { examId: exam.id, menuId, sortOrder: 0 },
			});
		}
		const audio = await db.mediaAsset.create({
			data: {
				ownerId: adminId,
				key: 'fixtures/' + uid + '.mp3',
				contentType: 'audio/mpeg',
				sizeBytes: 100,
				durationMs: 5000,
				uploadedAt: new Date(),
			},
		});
		for (const [sortOrder, label] of ['A', 'B'].entries()) {
			const { saveExamVariant: variantId } = await admin.ok(
				'mutation ($versionId: ID!, $input: VariantInput!) { saveExamVariant(versionId: $versionId, input: $input) }',
				{ versionId, input: { label, sortOrder } },
			);
			for (const [index, kind] of ['READING', 'WRITING', 'LISTENING'].entries()) {
				const { saveExamSection: sectionId } = await admin.ok(
					'mutation ($variantId: ID!, $input: SectionInput!) { saveExamSection(variantId: $variantId, input: $input) }',
					{
						variantId,
						input: {
							kind,
							durationSeconds: 90,
							sortOrder: index,
							audioMaxPlays: kind === 'LISTENING' ? 1 : null,
						},
					},
				);
				let groupId;
				if (kind === 'LISTENING') {
					({ saveQuestionGroup: groupId } = await admin.ok(
						'mutation ($sectionId: ID!, $input: QuestionGroupInput!) { saveQuestionGroup(sectionId: $sectionId, input: $input) }',
						{
							sectionId,
							input: { audioId: audio.id, audioStartMs: 100, audioEndMs: 1000 },
						},
					));
				}
				const input = {
					kind: kind === 'WRITING' ? 'TEXT' : 'CHOICE',
					prompt: '질문 ' + label + ' ' + kind,
					sortOrder: 0,
					points: 10,
					explanation: '설명',
					groupId,
					sampleAnswer: kind === 'WRITING' ? '예시 답안' : null,
					choices:
						kind === 'WRITING'
							? []
							: [
									{ text: '정답', correct: true },
									{ text: '오답', correct: false },
								],
				};
				await admin.ok(
					'mutation ($sectionId: ID!, $input: QuestionInput!) { saveQuestion(sectionId: $sectionId, input: $input) }',
					{ sectionId, input },
				);
			}
		}
		const publish =
			'mutation ($id: ID!) { publishExamVersion(id: $id) { currentVersionId } }';
		await admin.ok(publish, { id: versionId });
		for (const menuSlug of ['topik-1', sub.slug]) {
			const { getExamCatalog } = await guest.ok(
				'query ($slug: String!) { getExamCatalog(page: {}, filter: { menuSlug: $slug }) { list { id } } }',
				{ slug: menuSlug },
			);
			assert.ok(getExamCatalog.list.some(({ id }) => id === exam.id));
		}
		await guest.rejects(start, { input: { examId: exam.id, mode: 'FULL' } });
		await student.rejects('query ($id: ID!) { getAdminExamVersion(id: $id) { id } }', {
			id: versionId,
		});

		const recorded = await Promise.all([
			student.ok(open, { id: exam.id }),
			student.ok(open, { id: exam.id }),
		]);
		assert.deepEqual(recorded.map((row) => row.recordExamOpen).sort(), [0, 1]);
		const input = { examId: exam.id, mode: 'FULL' };
		const attempt = (await student.ok(start, { input })).startAttempt;
		assert.equal(attempt.variantLabel, 'A');
		assert.equal(attempt.versionId, versionId);
		assert.ok(attempt.remainingMs > 110000);
		const repeatTab = (await student.ok(start, { input })).startAttempt;
		assert.equal(repeatTab.id, attempt.id);
		const read = attempt.sections.find(({ kind }) => kind === 'READING').questions[0];
		const write = attempt.sections.find(({ kind }) => kind === 'WRITING').questions[0];
		const listening = attempt.sections.find(({ kind }) => kind === 'LISTENING').groups[0];
		const play =
			'mutation ($input: StartAudioInput!) { playAttemptAudio(input: $input) { playbackId plays startMs endMs url } }';
		const played = (
			await student.ok(play, { input: { attemptId: attempt.id, groupId: listening.id } })
		).playAttemptAudio;
		assert.equal(played.startMs, 100);
		assert.equal(played.endMs, 1000);
		assert.match(played.url, /r2\.cloudflarestorage\.com/);
		await student.ok(
			'mutation ($input: SaveAudioInput!) { saveAttemptAudio(input: $input) }',
			{
				input: {
					attemptId: attempt.id,
					groupId: listening.id,
					playbackId: played.playbackId,
					positionMs: 600,
				},
			},
		);
		await student.rejects(play, {
			input: { attemptId: attempt.id, groupId: listening.id, replay: true },
		});
		await student.ok(saveAnswer, {
			input: { attemptId: attempt.id, questionId: read.id, choiceId: read.choices[0].id },
		});
		await student.ok(saveAnswer, {
			input: { attemptId: attempt.id, questionId: write.id, text: '제가 쓴 답안' },
		});
		const saveWord =
			'mutation ($input: SaveVocabularyInput!) { saveVocabularyWord(input: $input) { id term languageCode sources { questionId examTitle } } }';
		for (const questionId of [read.id, write.id]) {
			await student.ok(saveWord, {
				input: { attemptId: attempt.id, questionId, term: ' 시험 ' },
			});
		}
		const { getVocabulary } = await student.ok(
			'{ getVocabulary(page: {}) { total list { term sources { questionId } } } }',
		);
		assert.equal(getVocabulary.total, 1);
		assert.equal(getVocabulary.list[0].sources.length, 2);
		await admin.rejects('query ($id: ID!) { getAttempt(id: $id) { id } }', {
			id: attempt.id,
		});
		await student.rejects(
			'query ($id: ID!) { getAttemptResult(id: $id) { review { correctChoiceId } } }',
			{ id: attempt.id },
		);

		const paused = (await student.ok(pause, { id: attempt.id })).pauseAttempt;
		assert.equal(paused.status, 'PAUSED');
		const other = (await student.ok(start, { input: { ...input, mode: 'READING' } }))
			.startAttempt;
		await student.ok(pause, { id: other.id });
		const { getPendingAttempts } = await student.ok(
			'{ getPendingAttempts { id status remainingMs } }',
		);
		assert.deepEqual(
			new Set(getPendingAttempts.map(({ id }) => id)),
			new Set([attempt.id, other.id]),
		);
		assert.equal(
			getPendingAttempts.find(({ id }) => id === attempt.id).remainingMs,
			paused.remainingMs,
		);

		const revised = (
			await admin.ok(
				'mutation ($examId: ID!) { createExamDraft(examId: $examId) { id variants { sections { id questions { prompt } } } } }',
				{ examId: exam.id },
			)
		).createExamDraft;
		assert.equal(revised.variants[0].sections[0].questions[0].prompt, read.prompt);
		await admin.ok(
			'mutation ($id: ID!) { updateExamDraft(id: $id, input: { title: "두 번째 시험", durationSeconds: 130 }) { id } }',
			{ id: revised.id },
		);
		await admin.ok(publish, { id: revised.id });
		const resume =
			'mutation ($id: ID!) { resumeAttempt(id: $id) { id title status versionId remainingMs } }';
		const resumed = (await student.ok(resume, { id: attempt.id })).resumeAttempt;
		assert.equal(resumed.versionId, versionId);
		assert.equal(resumed.title, '첫 번째 시험');
		const restoredAudio = (
			await student.ok(play, {
				input: { attemptId: attempt.id, groupId: listening.id },
			})
		).playAttemptAudio;
		assert.equal(restoredAudio.playbackId, played.playbackId);
		assert.equal(restoredAudio.plays, 1);
		const results = await Promise.all([
			student.ok(submit, { id: attempt.id }),
			student.ok(submit, { id: attempt.id }),
		]);
		assert.equal(results[0].submitAttempt.score, 10);
		assert.equal(results[0].submitAttempt.points, 4);
		assert.equal(
			results[0].submitAttempt.review.find(({ sampleAnswer }) => sampleAnswer)
				?.answerText,
			'제가 쓴 답안',
		);
		assert.equal((await student.ok(me)).getMe.memberPoints, 5);

		const retry = (await student.ok(start, { input })).startAttempt;
		assert.equal(retry.variantLabel, 'B');
		assert.equal(retry.versionId, revised.id);
		assert.equal(retry.title, '두 번째 시험');
		const retryRead = retry.sections.find(({ kind }) => kind === 'READING').questions[0];
		await student.ok(saveAnswer, {
			input: {
				attemptId: retry.id,
				questionId: retryRead.id,
				choiceId: retryRead.choices[0].id,
			},
		});
		assert.equal((await student.ok(submit, { id: retry.id })).submitAttempt.points, 0);
		await student.ok(resume, { id: other.id });
		await db.attempt.update({
			where: { id: other.id },
			data: { deadlineAt: new Date(Date.now() - 1000) },
		});
		for (let tick = 0; tick < 32; tick += 1) {
			const row = await db.attempt.findUniqueOrThrow({ where: { id: other.id } });
			if (row.status === 'COMPLETED') break;
			await wait(250);
		}
		assert.equal(
			(await db.attempt.findUniqueOrThrow({ where: { id: other.id } })).reason,
			'TIMEOUT',
		);
		const history = (
			await student.ok(
				'{ getAttemptHistory(page: {}) { total distinctCompletedTests memberPoints } }',
			)
		).getAttemptHistory;
		assert.deepEqual(history, { total: 3, distinctCompletedTests: 2, memberPoints: 5 });
		const leaderboard = (
			await guest.ok(
				'{ getLeaderboard(page: { limit: 100 }) { list { memberNick memberPoints rank } } }',
			)
		).getLeaderboard;
		assert.equal(
			leaderboard.list.find(({ memberNick }) => memberNick === nickname)?.memberPoints,
			5,
		);

		const { DailyPracticeService } = require('../dist/components/daily-practice/daily-practice.service.js');
		const { practiceDate } = require('../dist/libs/vocabulary/practice-date.js');
		const { publishVocabularyQuiz } = require('../dist/libs/vocabulary/publish-quiz.js');
		const practice = app.get(DailyPracticeService);
		const vocabularyRoot = await db.menu.findUniqueOrThrow({ where: { systemKey: 'VOCABULARY' } });
		const dictionary = await db.menu.create({
			data: {
				parentId: vocabularyRoot.id,
				slug: 'daily-fixture-' + uid,
				name: 'Daily vocabulary fixture',
				published: true,
			},
		});
		const words = Array.from({ length: 18 }, (_, index) => ({
			term: '단어' + (index + 1),
			translation: 'Translation ' + (index + 1),
			distractors: ['Other A', 'Other B', 'Other C'],
		}));
		await db.$transaction((tx) => publishVocabularyQuiz(
			tx,
			{ slug: dictionary.slug, menus: { create: { menuId: dictionary.id } } },
			dictionary.name,
			words,
		));
		const day = practiceDate();
		const midnight = new Date(day.getTime() - 5 * 60 * 60 * 1000);
		const beforeMidnight = new Date(midnight.getTime() - 1);
		assert.notEqual(practiceDate(beforeMidnight).getTime(), day.getTime());
		assert.equal(practiceDate(midnight).getTime(), day.getTime());
		const yesterday = await practice.ensure(beforeMidnight);
		const generated = await Promise.all(Array.from({ length: 4 }, () => practice.ensure(midnight)));
		assert.ok(yesterday);
		assert.ok(generated[0]);
		assert.notEqual(generated[0].slug, yesterday.slug);
		assert.deepEqual(generated, Array(4).fill(generated[0]));

		const { getDailyPractice: today } = await guest.ok(
			'{ getDailyPractice { date questionCount exam { id slug } } }',
		);
		assert.equal(today.date, day.toISOString().slice(0, 10));
		assert.equal(today.questionCount, 15);
		assert.equal(today.exam.slug, generated[0].slug);
		const dailyAttempt = (await student.ok(start, { input: { examId: today.exam.id, mode: 'FULL' } })).startAttempt;
		const dailyQuestions = dailyAttempt.sections[0].questions;
		assert.equal(dailyQuestions.length, 15);
		assert.equal(new Set(dailyQuestions.map(({ prompt }) => prompt)).size, 15);
		assert.ok(dailyQuestions.every(({ choices }) => choices.length === 4));

		const oldExam = await db.exam.findUniqueOrThrow({
			where: { slug: yesterday.slug },
			include: { currentVersion: { include: { variants: true } } },
		});
		await student.rejects(start, { input: { examId: oldExam.id, mode: 'FULL' } });
		const oldAttempt = await db.attempt.create({
			data: {
				memberId: profile.id,
				examId: oldExam.id,
				versionId: oldExam.currentVersionId,
				variantId: oldExam.currentVersion.variants[0].id,
				mode: 'FULL',
				status: 'PAUSED',
				durationMs: 450000,
				remainingMs: 420000,
			},
		});
		const prior = (await student.ok(resume, { id: oldAttempt.id })).resumeAttempt;
		assert.equal(prior.versionId, oldExam.currentVersionId);
		assert.equal(prior.status, 'IN_PROGRESS');
	},
);
