# Quiz backend

NestJS code-first GraphQL API. Loyiha talablari va frontend tuzilishi [PROJECT_SPEC.md](../PROJECT_SPEC.md)da.

## Lokal ishga tushirish

Node.js 22.12 yoki undan yangi versiya va PostgreSQL kerak.

```sh
npm ci
cp .env.example .env
node -p "require('node:crypto').randomBytes(48).toString('base64url')"
```

Hosil bo‘lgan qiymatni `JWT_SECRET`ga, PostgreSQL ulanish manzilini `DATABASE_URL`ga yozing. `FRONTEND_URL` va `PUBLIC_API_URL` sayt va API originlari.

```sh
npm run db:generate
npm run db:deploy
npm run start:dev
```

API odatda `http://localhost:4000/graphql`da ochiladi. Build uchun `npm run build`, tayyor buildni ishga tushirish uchun `npm start` ishlatiladi. Migratsiya koreys tili va TOPIK katalogining doimiy menyularini yaratadi. TOPIK va Mock savollari dashboard orqali yoki taqdim etiladigan datasetdan bazaga kiritiladi.

## Rasmiy TOPIK imtihonlarini import qilish

Import manifesti rasmiy savol sahifalari, javoblar, ballar, manba URL’lari va media fayllarining SHA-256 nomlarini saqlaydi. Manifest yonidagi `media/` papkasida WebP va MP3 fayllari bo‘lishi kerak. Import har bir raundning ikkala darajasini, savol raqamlari va bo‘lim ballarini tekshiradi. Har bir imtihon bitta tranzaksiyada e’lon qilinadi. Aynan shu dataset bilan importni qayta ishga tushirish duplikat yaratmaydi.

```sh
npm run db:deploy
npm run topik:import -- /path/to/dataset/manifest.json admin-nickname
```

Odatda media to‘rtta `R2_*` sozlamasi orqali Cloudflare R2’ga yuklanadi. Lokal ko‘rish uchun import vaqtida `TOPIK_MEDIA_STORAGE=local` va import hamda API uchun `EXAM_MEDIA_DIR=/path/to/dataset/media` sozlang. API Next.js orqali imzolangan media URL’larini taqdim etadi. Test variantlari PDF sahifasida raqamlar bilan beriladi. Yozma javoblar namunalari test topshirilgach ko‘rinadi.

### PDF’dan savol rasmlarini ajratish

`prisma/topik-layouts/102-II.json` asl 102-raund TOPIK II PDF’laridagi savol va umumiy matn chegaralarini saqlaydi. Yangi rasmga tanlangan savol, uning variantlari va tegishli umumiy matn kiradi. Tayyorlash uchun Python 3, PyMuPDF va Pillow kerak.

```sh
python3 prisma/crop-topik-questions.py /path/to/dataset/manifest.json /path/to/papers prisma/topik-layouts/102-II.json --output /path/to/dataset/question-images.json
npm run topik:import -- /path/to/dataset/question-images.json admin-nickname
```

PDF fayllarni `/path/to/papers/102-II/` jildiga layout faylida ko‘rsatilgan nomlar bilan joylang. Avval import qilingan imtihonda savol rasmlari yangi versiyada e’lon qilinadi. Oldin boshlangan urinishlar o‘z versiyasida qoladi.

### Tinglash fayllarini brauzerga moslash

TOPIK Guide arxividagi ayrim tinglash fayllari boshqa audio kodekida yoki ichiga qo‘shimcha ID3 teglari yozilgan MP3 formatida keladi. Tayyorlov skripti FFmpeg bilan audio yo‘lakni ajratadi, kerak bo‘lsa MP3’ga o‘giradi va tayyor faylni boshidan oxirigacha dekodlab tekshiradi. Ichki teglar olib tashlanganda MP3 audio kadrlari qayta kodlanmaydi.

```sh
python3 prisma/normalize-topik-audio.py /path/to/dataset/question-images.json --round 64 --round 83 --round 96 --output /path/to/dataset/verified-audio.json
npm run topik:import -- /path/to/dataset/verified-audio.json admin-nickname
```

Yangilangan audio yangi urinishlarda e’lon qilingan imtihon versiyasidan keladi.

## TOPIK II Mock Exam importi

Tayyorlov skripti o‘qish va tinglash savollarini belgilangan GitHub versiyalaridan oladi, javob raqamlari va ballarni alohida kalit fayllari bilan solishtiradi hamda audio va rasmlarni tayyorlaydi. 100, 97 va 99-raund o‘qish javoblari manbada qoralama deb belgilangan. Yozish topshiriqlari avval import qilingan rasmiy TOPIK II imtihonlari va ularning namunaviy javoblaridan olinadi. [O‘qish manbasi](https://github.com/jisdcm29-sketch/topik2-reading-ibt/tree/3c7bf35d696f66f1217b9f28c1d2c0717aa9a62f) · [Tinglash manbasi](https://github.com/jisdcm29-sketch/topik2-listening-ibt/tree/7299a4f2fd60bd34bda3dc7c03dca7a134005b0c) · [Yozish manbasi](https://www.topikguide.com/previous-papers/)

Tayyorlash uchun Python 3, Pillow va FFmpeg tarkibidagi `ffprobe` kerak. PostgreSQL’da rasmiy TOPIK importi va admin akkaunti bo‘lishi kerak.

```sh
python3 prisma/prepare-mock.py /path/to/mock-dataset
npm run mock:import -- /path/to/mock-dataset/manifest.json admin-nickname
```

Import media uchun rasmiy testlar bilan bir xil R2 yoki lokal sozlamalardan foydalanadi. Lokal rejimda Mock media fayllari API ishlatayotgan `EXAM_MEDIA_DIR`ga joylanadi. Bitta e’lon qilingan Mock test ichidagi o‘nta variant urinishlar bo‘yicha navbat bilan ochiladi. Shu import qayta ishga tushirilganda duplikat yaratilmaydi.

## Lug‘at to‘plamlarini import qilish

PDF’dan ajratilgan so‘z va tarjimalarni manba bilan solishtirgach, UTF-8 JSON faylida saqlang. Har bir to‘plam o‘z `slug`iga ega. Masalan:

```json
{
  "slug": "collection-name",
  "title": "To‘plam nomi",
  "words": [
    { "term": "학교", "translation": "maktab" },
    { "term": "책", "translation": "kitob" },
    { "term": "물", "translation": "suv" },
    { "term": "나무", "translation": "daraxt" }
  ]
}
```

```sh
npm run db:deploy
npm run vocabulary:import -- /path/to/collection.json
```

Import so‘zlarni manba tartibida 30 tadan bo‘limga ajratadi. Bir xil yoziladigan koreyscha so‘zlarning manbadagi yozuvlari o‘z o‘rnida saqlanadi. Har bir urinishda savolga bitta to‘g‘ri va uchta boshqa tarjima aralash holda chiqariladi. Chalg‘ituvchi variantlar shu so‘z uchun manbada ko‘rsatilgan boshqa ma’nolardan ham farqlanadi. Variantlar urinish davomida bir xil tartibda saqlanadi. Bir xil faylni qayta import qilish takroriy yozuv yaratmaydi.

Skript PDF matnini koordinatalar bilan solishtiradi va raqamlar ketma-ketligini tekshiradi. `초급` kitobida 1 552 ta, `중급` va `고급` kitoblarida 1 500 tadan yozuv bor. Tayyorlash uchun PyMuPDF va Poppler tarkibidagi `pdftotext` kerak.

```sh
python3 prisma/prepare-topik-1500-vocabulary.py /path/to/beginner.pdf /path/to/beginner.json
npm run vocabulary:import -- /path/to/beginner.json

python3 prisma/prepare-topik-1500-vocabulary.py --level intermediate /path/to/intermediate.pdf /path/to/intermediate.json
npm run vocabulary:import -- /path/to/intermediate.json ssok-ssok-junggeup

python3 prisma/prepare-topik-1500-vocabulary.py --level advanced /path/to/advanced.pdf /path/to/advanced.json
npm run vocabulary:import -- /path/to/advanced.json ssok-ssok-gogeup
```

Har bir to‘plam **Lug‘atlar → 쏙-쏙** ichidagi o‘z darajasida chiqadi.

**Lug‘atlar → TOPIK In 30 Days** to‘plami PDFdagi 1 000 ta yozuvni asl kun tartibida saqlaydi. Har bir kun bitta test bo‘lib, 33 yoki 34 ta so‘zdan iborat. Skript import uchun har biri `title` va `words` maydonlaridan iborat `units` ro‘yxatini yaratadi. `Day 21` dagi `대하다` so‘zining manbada bo‘sh qolgan tarjimasi «muomala qilmoq» bilan to‘ldiriladi.

```sh
python3 prisma/prepare-topik-in-30-days-vocabulary.py /path/to/topik-in-30-days.pdf /path/to/30-days.json
npm run vocabulary:import -- /path/to/30-days.json
```

## Kunlik mashq

`getDailyPractice` bugungi mashq sanasi va testini qaytaradi. NestJS cron jadvali Toshkent vaqti bilan har kuni soat 00:00 da ochiq koreyscha lug‘atlardan 15 ta turli so‘z tanlaydi. Server ishga tushganda va mashq sahifasi so‘ralganda bugungi mashq mavjudligi tekshiriladi. Baza bitta sana uchun bitta test saqlaydi. Avvalgi kunning boshlangan urinishlari o‘z versiyasida davom etadi.

## Auth va tashqi xizmatlar

| Xizmat                | Sozlama                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google OIDC           | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, callback `<PUBLIC_API_URL>/auth/google/callback`                                                                         |
| Telegram OIDC         | Telegram Login client ID va secret, callback `<PUBLIC_API_URL>/auth/telegram/callback`                                                                               |
| Gmail’ga OTP yuborish | `SMTP_URL` va `MAIL_FROM`                                                                                                                                            |
| Cloudflare R2         | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. R2 CORS sozlamasida frontend origini uchun `PUT`, `GET` va `Content-Type`ga ruxsat bering. |

Frontend browserda `GET /auth/google/start` yoki `GET /auth/telegram/start` manziliga yo‘naltiradi. `returnTo` mahalliy frontend yo‘li. Google akkauntini joriy profilga ulash uchun `link=true` yuboriladi. Google callback frontendga `gmailChallenge` identifikatorini qaytaradi va foydalanuvchi emailga kelgan kodni `verifyGmailOtp` mutationiga kiritadi.

GraphQL brauzer so‘rovlarida `credentials: 'include'` ishlatiladi. Access JWT 2 kun, aylantiriladigan refresh tokenli sessiya 7 kun amal qiladi. Joylashtirishda frontend va API bir sayt doirasidagi HTTPS originlarida ishlashi yoki frontend orqali API’ga proksi qilinishi kerak. Bir nechta parallel so‘rovda frontend refreshni bitta chaqiruvga birlashtiradi.

## Admin va test ekrani

Birinchi admin avval odatiy akkaunt sifatida ro‘yxatdan o‘tadi.

```sh
npm run admin:grant -- admin_nickname
```

- `createExam` test va birinchi qoralamani yaratadi. Admin undan variant, bo‘lim, savol guruhi va savollarni yaratadi, `setExamMenu` bilan katalogga biriktiradi va `publishExamVersion` bilan e’lon qiladi. Keyingi tahrir `createExamDraft` orqali ochiladi.
- R2 uchun `createMediaUpload` qaytargan URL’ga faylni shu `contentType` bilan `PUT` qiling va `completeMediaUpload`ni chaqiring. Yakunlangan media ID’si testga yoki avatar sifatida profilga biriktiriladi.
- Ochiq test sahifasi `getExamOverview`dan foydalanadi. Kirgan foydalanuvchi sahifani ochganida `recordExamOpen`ni chaqiring. `startAttempt` ham shu +1 pointni bir martalik yozuv orqali qayd qiladi.
- Player navigatsiyasi `moveAttempt`, javob uchun `saveAttemptAnswer`, audio uchun `playAttemptAudio` va `saveAttemptAudio`dan foydalanadi. Pauza yoki topshirishdan avval lokal javob so‘rovlari tugashini kuting. Server qaytargan `deadlineAt` va `serverNow` taymer asosi.
- Natija `getAttemptResult` orqali ochiladi. `getAttemptHistory`, `getPendingAttempts` va `getVocabulary` shaxsiy sahifa ma’lumotlarini beradi.

## Tekshiruv

```sh
npm run lint
npm run typecheck
npm run build
```

Integratsion sinov uchun alohida PostgreSQL test bazasiga migratsiyani qo‘llang va uning URL’ini `TEST_DATABASE_URL`ga bering.

```sh
npm run test:e2e
```

Sinov haqiqiy HTTP, GraphQL, lokal SMTP va PostgreSQL’dan foydalanadi. Google va Telegram provider javoblari testda almashtiriladi. R2 URL imzolanishi mahalliy tekshiriladi. Sinov bazaga alohida fixture yozuvlarini qo‘shadi.
