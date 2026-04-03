import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"

import { emails, users } from "@/lib/schema"
import * as schema from "@/lib/schema"

const ACTIVE_EXPIRY_MS = 1000 * 60 * 60

function initializeSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE "user" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text,
      "email" text,
      "emailVerified" integer,
      "image" text,
      "username" text,
      "password" text
    );

    CREATE UNIQUE INDEX "user_email_unique" ON "user" ("email");
    CREATE UNIQUE INDEX "user_username_unique" ON "user" ("username");

    CREATE TABLE "email" (
      "id" text PRIMARY KEY NOT NULL,
      "address" text NOT NULL,
      "userId" text,
      "created_at" integer NOT NULL,
      "expires_at" integer NOT NULL,
      "pinned_at" integer,
      FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE cascade
    );

    CREATE UNIQUE INDEX "email_address_unique" ON "email" ("address");
    CREATE INDEX "email_expires_at_idx" ON "email" ("expires_at");
    CREATE INDEX "email_user_id_idx" ON "email" ("userId");
    CREATE INDEX "email_address_lower_idx" ON "email" (LOWER("address"));
    CREATE INDEX "email_pinned_at_idx" ON "email" ("pinned_at");
  `)
}

export function createDb() {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
  initializeSchema(sqlite)

  return drizzle({ client: sqlite, schema })
}

export type TestDb = ReturnType<typeof createDb>

export function createTestUser(db: TestDb) {
  const userId = crypto.randomUUID()

  db.insert(users)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      username: `user-${userId}`,
      name: "Test User",
      password: "password",
    })
    .run()

  return userId
}

type CreateTestEmailOptions = {
  address?: string
  createdAt?: Date
  expiresAt?: Date
  pinnedAt?: Date | null
}

export function createTestEmail(db: TestDb, userId: string, options: CreateTestEmailOptions = {}) {
  const email = {
    id: crypto.randomUUID(),
    address: options.address ?? `${crypto.randomUUID()}@moemail.app`,
    userId,
    createdAt: options.createdAt ?? new Date(),
    expiresAt: options.expiresAt ?? new Date(Date.now() + ACTIVE_EXPIRY_MS),
    pinnedAt: options.pinnedAt ?? null,
  }

  db.insert(emails).values(email).run()

  return email
}

export function cleanup(db: TestDb) {
  db.delete(emails).run()
  db.delete(users).run()
}
