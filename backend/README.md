# OmniFlow Backend

Stripe-like API for cross-chain crypto payments built with NestJS, Prisma, and SQLite.

## Tech Stack

- **NestJS 11.1** - Modern Node.js framework
- **Prisma 7** - Type-safe ORM
- **SQLite** - Development database (PostgreSQL for production)
- **TypeScript 5.9** - Type safety
- **Swagger** - API documentation
- **Jest 30** - Testing framework

## Prerequisites

- Node.js 18+ and npm
- No database setup needed (SQLite is file-based)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your configuration
```

### 3. Initialize Database

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations (creates SQLite database)
npm run prisma:migrate

# (Optional) Open Prisma Studio to view data
npm run prisma:studio
```

### 4. Start Development Server

```bash
# Development mode with hot reload
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The API will be available at:
- **API**: http://localhost:3000/v1
- **Swagger Docs**: http://localhost:3000/api

## API Endpoints

### Accounts
- `POST /v1/accounts` - Create account
- `GET /v1/accounts` - List accounts
- `GET /v1/accounts/:id` - Get account
- `GET /v1/accounts/:id/balance` - Get balance
- `PATCH /v1/accounts/:id` - Update account

### Deposits
- `POST /v1/deposits/address` - Get deposit address
- `POST /v1/deposits` - Create deposit intent
- `GET /v1/deposits` - List deposits
- `GET /v1/deposits/:id` - Get deposit

### Payouts
- `POST /v1/payouts` - Create single payout
- `POST /v1/payouts/batch` - Create batch payout
- `GET /v1/payouts` - List payouts
- `GET /v1/payouts/:id` - Get payout
- `GET /v1/payouts/batch/:id` - Get batch payout

### Transfers
- `POST /v1/transfers` - Create internal transfer (instant & free)
- `GET /v1/transfers` - List transfers
- `GET /v1/transfers/:id` - Get transfer

### Webhooks
- `POST /v1/webhooks` - Register webhook
- `GET /v1/webhooks` - List webhooks
- `GET /v1/webhooks/:id` - Get webhook
- `DELETE /v1/webhooks/:id` - Delete webhook

## Database Commands

```bash
# Generate Prisma Client after schema changes
npm run prisma:generate

# Create and apply migrations
npm run prisma:migrate

# Open Prisma Studio (database GUI)
npm run prisma:studio

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

## Development

```bash
# Run in development mode
npm run start:dev

# Run tests
npm test

# Run e2e tests
npm run test:e2e

# Lint and fix
npm run lint

# Format code
npm run format
```

## Project Structure

```
backend/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── accounts/              # Account management
│   ├── deposits/              # Deposit operations
│   ├── payouts/               # Payout operations
│   ├── transfers/             # Internal transfers
│   ├── webhooks/              # Webhook management
│   ├── common/                # Shared modules (Prisma, etc.)
│   ├── config/                # Configuration
│   ├── app.module.ts          # Root module
│   └── main.ts                # Application entry point
├── .env                       # Environment variables
└── package.json
```

## Database Schema

### Models

- **Account** - User sub-accounts with Circle wallet addresses
- **Deposit** - Incoming funds tracking
- **Payout** - Outgoing payment records
- **PayoutBatch** - Batch payout operations
- **Transfer** - Internal account-to-account transfers
- **Webhook** - Webhook configurations
- **WebhookDelivery** - Webhook delivery log

## Migration to PostgreSQL

When ready for production, update `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/omniflow"
```

Then update `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"  // Change from "sqlite"
  url      = env("DATABASE_URL")
}
```

Run migrations:

```bash
npm run prisma:migrate
```

## Future Integration

This is currently a skeleton. Circle API integration and actual blockchain operations will be added in future iterations:

- Circle Gateway integration for cross-chain USDC
- Circle Modular Wallets for AA accounts
- LiFi integration for token swaps
- ENS resolution
- Webhook delivery system
- Fee collection logic
- Balance tracking
