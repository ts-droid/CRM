# ReDirection CRM (Codex recreation)

Detta projekt återskapar den genomgångna lösningen:
- `Next.js` + `TypeScript`
- `Prisma` + `PostgreSQL`
- API-routes för `customers`, `contacts`, `plans`
- Design inspirerad av `support-matrix-production.up.railway.app` (färgpalett + typografikänsla)
- Förberett för deploy på Railway

## 1) Installera

```bash
npm install
```

## 2) Konfigurera miljövariabler

```bash
cp .env.example .env
```

Sätt korrekt `DATABASE_URL` från Railway PostgreSQL i `.env`.

## 3) Prisma migration och client

```bash
npm run prisma:migrate
npm run prisma:generate
```

## 4) Kör lokalt

```bash
npm run dev
```

Öppna:
- `http://localhost:3000`
- `http://localhost:3000/api/customers`
- `http://localhost:3000/api/contacts`
- `http://localhost:3000/api/plans`

## 5) Deploy till Railway

1. Pusha repo till GitHub.
2. I Railway: skapa web service från repo.
3. Lägg in `DATABASE_URL` under `Variables`.
4. Deploy.

`railway.json` är inkluderad för build/start.

## Datamodell (Prisma)

- `Customer`
- `Contact` (kopplad till `Customer`)
- `Plan` (kopplad till `Customer`)
- `PlanStatus` enum

## Nästa steg

- Lägg till autentisering (NextAuth eller Clerk)
- Rollstyrning (admin/sälj)
- Aktivitetslogg per kund/kontakt
- Integration med försäljnings-API
