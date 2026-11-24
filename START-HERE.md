# Flora AI backend

Backend va frontend arxivlarini bitta ota papkaga oching. Har bir dastur uchun buyruqlarni o‘z papkasida bajaring. Backend uchun Node.js 22.12 yoki yangiroq versiya hamda PostgreSQL kerak.

## Ishga tushirish

Terminalda `quiz backend` ichiga kiring.

```sh
npm ci
cp .env.example .env
node -p "require('node:crypto').randomBytes(48).toString('base64url')"
```

`.env` ichida `DATABASE_URL`ga PostgreSQL manzilini, `JWT_SECRET`ga hosil bo‘lgan qiymatni kiriting. Lokal Next.js proksisi bilan `FRONTEND_URL` va `PUBLIC_API_URL` uchun `http://localhost:3000`ni ishlating.

```sh
npm run db:generate
npm run db:deploy
npm run start:dev
```

GraphQL API `http://localhost:4000/graphql` manzilida ishlaydi. Frontendni alohida terminalda `quiz frontend` papkasidan ishga tushiring.

## Lug‘atlar va Kunlik mashq

Migratsiyadan keyin backend papkasida quyidagi buyruqlarni bajaring. Kunlik mashq e’lon qilingan lug‘atlardan 15 ta so‘z tanlaydi.

```sh
npm run vocabulary:import -- datasets/vocabulary/ssok-ssok-chogeup.json
npm run vocabulary:import -- datasets/vocabulary/ssok-ssok-junggeup.json ssok-ssok-junggeup
npm run vocabulary:import -- datasets/vocabulary/ssok-ssok-gogeup.json ssok-ssok-gogeup
npm run vocabulary:import -- datasets/vocabulary/topik-in-30-days.json
```

## TOPIK va Mock Exam

`datasets/exams/topik.json` va `datasets/exams/mock.json` tayyor import manifestlari. Import uchun alohida media to‘plamidagi manifestlarga mos MP3 va WebP fayllarni `datasets/exams/media/` papkasiga qo‘ying. `.env`da `EXAM_MEDIA_DIR`ga shu papkaning to‘liq yo‘lini va `TOPIK_MEDIA_STORAGE=local`ni yozing.

Sayt orqali yangi akkaunt oching. Quyidagi buyruqlardagi `admin_nickname`ni o‘sha akkaunt nomi bilan almashtiring.

```sh
npm run admin:grant -- admin_nickname
npm run topik:import -- datasets/exams/topik.json admin_nickname
npm run mock:import -- datasets/exams/mock.json admin_nickname
```

OAuth, Gmail OTP va Cloudflare R2 uchun o‘zingizning sozlamalaringizdan foydalaning. Batafsil ma’lumot [backend README](README.md)da.
