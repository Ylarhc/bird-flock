# Tennis Head-to-Head API

A REST API over a small tennis player dataset. Full CRUD on players,
plus a few computed KPIs. Built with TypeScript and zod, deployed as
AWS Lambda functions backed by DynamoDB, fronted by an HTTP API Gateway.

## Setup (deploy)

Requires real AWS credentials in the environment (e.g. via `aws configure`
or exported `AWS_*` variables).

```bash
npm install
npm run build                            # compiles and packages the Lambda zip
cd terraform && terraform init && terraform apply   # deploys DynamoDB, Lambdas, and the HTTP API
cd ..
npm run db:seed                          # seeds the table (match AWS_REGION/TABLE_NAME to your terraform vars if changed)
```

After `terraform apply`, read the `api_endpoint` output for the live API URL:

```bash
cd terraform && terraform output api_endpoint
```

## Development

```bash
npm run build    # clean, compile to dist/, and package the Lambda deployment zip
npm test          # run the Jest test suite
```

Running `npm test` requires Docker and Terraform available on `PATH`:
`tests/jest.global-setup.js` starts a local Floci container and applies
the DynamoDB schema against it in an isolated Terraform state/data dir,
separate from the real deploy state under `terraform/`.

## Endpoints

- `GET /players`            — list all players, sorted by most match wins (`data.last`) first
- `GET /players/:id`        — get one player
- `POST /players`           — create a player
- `PUT /players/:id`        — update a player
- `DELETE /players/:id`     — delete a player
- `GET /kpis/best-country`  — country with the best aggregate win ratio
- `GET /kpis/average-bmi`   — average BMI across all players
- `GET /kpis/median-height` — median player height
- `GET /kpis`               — retrieve all kpis
- `POST /reset`             — clear the Players table and reload the seed data
