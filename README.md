# Tennis Head-to-Head API

A REST API over a small tennis player dataset. Full CRUD on players,
plus a few computed KPIs. Built with Express, TypeScript, Prisma,
SQLite, and zod.

## Setup

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run db:seed
```

## Development

```bash
npm run dev      # start the API with ts-node
npm run build    # compile to dist/
npm start         # run the compiled build
npm test          # run the Jest test suite
```

## Endpoints

- `GET /players`            — list all players
- `GET /players/:id`        — get one player
- `POST /players`           — create a player
- `PUT /players/:id`        — update a player
- `DELETE /players/:id`     — delete a player
- `GET /kpis/best-country`  — country with the best aggregate win ratio
- `GET /kpis/average-bmi`   — average BMI across all players
- `GET /kpis/median-height` — median player height
- `GET /kpis`               — retrieve all kpis
