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

För Google Auth:
- `AUTH_SECRET` (lång slumpad sträng)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URL` (ex. `https://<din-domän>/api/auth/google/callback`)
- `AUTH_ALLOWED_DOMAIN` (ex. `vendora.se`)
- valfritt: `AUTH_ALLOWED_EMAILS` (kommaseparerad allowlist)

För notifieringar:
- `SMTP_HOST` (ex. `smtp.gmail.com`)
- `SMTP_PORT` (ex. `587`)
- `SMTP_USER`
- `SMTP_PASS` (Gmail app password)

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

## Nya backend-endpoints (research/AI)

- `POST /api/research`
  - Tar emot `customerId` eller `companyName` + valfria `websites`.
  - Hämtar webbdata från flera sidor, hittar liknande kunder, och returnerar en färdig AI-prompt.
- `GET /api/customers/:id/similar?scope=region|country`
  - Returnerar rankade liknande kunder.
- `POST /api/customers/:id/sync-webshop`
  - Hämtar data från kundens webbplats och uppdaterar `webshopSignals` + `potentialScore`.
- `GET|PUT /api/admin/settings`
  - Hämtar/sparar research-inställningar (vendor-/brand-webbsidor, default scope, extra AI-instruktioner).
- `GET /api/admin/csv/export`
  - Exporterar kunder till CSV.
- `POST /api/admin/csv/import`
  - Importerar kunder från CSV (uppdaterar om `id` finns, annars skapar).

## Nästa steg

- Rollstyrning (admin/sälj)
- Schemalagd reminders-körning via Railway Cron
- Integration med försäljnings-API
