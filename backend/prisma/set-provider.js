/**
 * Switches Prisma datasource provider based on DATABASE_URL.
 * - Starts with "postgresql://" or "postgres://" → postgresql
 * - Otherwise → sqlite (default for local dev)
 *
 * Run before `prisma generate` and `prisma db push` in production.
 */
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf-8');

const dbUrl = process.env.DATABASE_URL || '';
const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');
const provider = isPostgres ? 'postgresql' : 'sqlite';

const updated = schema.replace(
  /provider\s*=\s*"(sqlite|postgresql)"/,
  `provider = "${provider}"`,
);

if (updated !== schema) {
  fs.writeFileSync(schemaPath, updated);
  console.log(`Prisma provider set to: ${provider}`);
} else {
  console.log(`Prisma provider already: ${provider}`);
}
