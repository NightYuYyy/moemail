import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { and, desc, eq, gt, gte, isNotNull, lt, or, sql } from "drizzle-orm"

import { encodeCursor, decodeCursor } from "@/lib/cursor"
import { emails } from "@/lib/schema"
import { EXPIRY_OPTIONS } from "@/types/email"

import { cleanup, createDb, createTestEmail, createTestUser, type TestDb } from "../helpers/test-db"

const PAGE_SIZE = 20
const PERMANENT_THRESHOLD = new Date("9999-01-01T00:00:00.000Z")
const PERMANENT_EXPIRY_OPTION = EXPIRY_OPTIONS.find((option) => option.value === 0)

type ListEmailsInput = {
  cursor?: string
  permanentOnly?: boolean
  search?: string
  userId: string
}

function listEmailsQuery(db: TestDb, input: ListEmailsInput) {
  const pinnedConditions = [
    eq(emails.userId, input.userId),
    isNotNull(emails.pinnedAt),
    gt(emails.expiresAt, new Date()),
  ]

  if (input.search) {
    pinnedConditions.push(sql`LOWER(${emails.address}) LIKE LOWER(${"%" + input.search + "%"})`)
  }

  if (input.permanentOnly) {
    pinnedConditions.push(gte(emails.expiresAt, PERMANENT_THRESHOLD))
  }

  const pinnedResults = db
    .select()
    .from(emails)
    .where(and(...pinnedConditions))
    .orderBy(desc(emails.pinnedAt))
    .all()

  const baseConditions = and(
    eq(emails.userId, input.userId),
    gt(emails.expiresAt, new Date()),
    sql`${emails.pinnedAt} IS NULL`,
  )

  const countConditions = [baseConditions]

  if (input.search) {
    countConditions.push(sql`LOWER(${emails.address}) LIKE LOWER(${"%" + input.search + "%"})`)
  }

  if (input.permanentOnly) {
    countConditions.push(gte(emails.expiresAt, PERMANENT_THRESHOLD))
  }

  const totalResult = db
    .select({ count: sql<number>`count(*)` })
    .from(emails)
    .where(and(...countConditions))
    .get()

  const conditions = [...countConditions]

  if (input.cursor) {
    const { timestamp, id } = decodeCursor(input.cursor)
    conditions.push(
      or(
        lt(emails.createdAt, new Date(timestamp)),
        and(eq(emails.createdAt, new Date(timestamp)), lt(emails.id, id)),
      ),
    )
  }

  const results = db
    .select()
    .from(emails)
    .where(and(...conditions))
    .orderBy(desc(emails.createdAt), desc(emails.id))
    .limit(PAGE_SIZE + 1)
    .all()

  const hasMore = results.length > PAGE_SIZE
  const nextCursor = hasMore
    ? encodeCursor(results[PAGE_SIZE - 1].createdAt.getTime(), results[PAGE_SIZE - 1].id)
    : null

  return {
    emails: hasMore ? results.slice(0, PAGE_SIZE) : results,
    nextCursor,
    pinned: pinnedResults,
    total: Number(totalResult?.count ?? 0),
  }
}

describe("pin query logic", () => {
  let db: TestDb

  beforeEach(() => {
    db = createDb()
  })

  afterEach(() => {
    cleanup(db)
  })

  it("returns pinned emails separately in newest-pinned-first order", () => {
    const userId = createTestUser(db)
    const olderPinned = createTestEmail(db, userId, {
      address: "older-pinned@moemail.app",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      pinnedAt: new Date("2026-01-03T00:00:00.000Z"),
    })
    const newerPinned = createTestEmail(db, userId, {
      address: "newer-pinned@moemail.app",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      pinnedAt: new Date("2026-01-04T00:00:00.000Z"),
    })
    createTestEmail(db, userId, {
      address: "unpinned@moemail.app",
      createdAt: new Date("2026-01-05T00:00:00.000Z"),
    })

    const pinnedCount = db
      .select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(and(eq(emails.userId, userId), isNotNull(emails.pinnedAt)))
      .get()

    expect(Number(pinnedCount?.count ?? 0)).toBe(2)

    const result = listEmailsQuery(db, { userId })

    expect(result.pinned.map((email) => email.id)).toEqual([newerPinned.id, olderPinned.id])
  })

  it("excludes pinned emails from the paginated email list", () => {
    const userId = createTestUser(db)
    const pinned = createTestEmail(db, userId, {
      address: "pinned@moemail.app",
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      pinnedAt: new Date("2026-01-04T00:00:00.000Z"),
    })
    const unpinned = createTestEmail(db, userId, {
      address: "unpinned@moemail.app",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    })

    const result = listEmailsQuery(db, { userId })

    expect(result.pinned.map((email) => email.id)).toEqual([pinned.id])
    expect(result.emails.map((email) => email.id)).toEqual([unpinned.id])
  })

  it("moves an email back into paginated results after unpinning", () => {
    const userId = createTestUser(db)
    const repinnedToList = createTestEmail(db, userId, {
      address: "repinned-to-list@moemail.app",
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
      pinnedAt: new Date("2026-01-05T00:00:00.000Z"),
    })
    const stillPinned = createTestEmail(db, userId, {
      address: "still-pinned@moemail.app",
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      pinnedAt: new Date("2026-01-06T00:00:00.000Z"),
    })

    db.update(emails)
      .set({ pinnedAt: null })
      .where(eq(emails.id, repinnedToList.id))
      .run()

    const result = listEmailsQuery(db, { userId })

    expect(result.pinned.map((email) => email.id)).toEqual([stillPinned.id])
    expect(result.emails.map((email) => email.id)).toContain(repinnedToList.id)
  })
})

describe("search query logic", () => {
  let db: TestDb

  beforeEach(() => {
    db = createDb()
  })

  afterEach(() => {
    cleanup(db)
  })

  it("filters addresses case-insensitively by substring", () => {
    const userId = createTestUser(db)
    createTestEmail(db, userId, { address: "alpha-box@moemail.app" })
    createTestEmail(db, userId, { address: "beta-box@moemail.app" })

    const result = listEmailsQuery(db, { search: "ALPHA", userId })

    expect(result.emails.map((email) => email.address)).toEqual(["alpha-box@moemail.app"])
  })

  it("applies search to both pinned and unpinned collections", () => {
    const userId = createTestUser(db)
    const matchingPinned = createTestEmail(db, userId, {
      address: "alpha-pinned@moemail.app",
      pinnedAt: new Date("2026-01-08T00:00:00.000Z"),
    })
    createTestEmail(db, userId, {
      address: "beta-pinned@moemail.app",
      pinnedAt: new Date("2026-01-07T00:00:00.000Z"),
    })
    const matchingUnpinned = createTestEmail(db, userId, { address: "alpha-open@moemail.app" })

    const rawLikeMatches = db
      .select({ address: emails.address })
      .from(emails)
      .where(sql`LOWER(${emails.address}) LIKE ${`%alpha%`}`)
      .all()

    expect(rawLikeMatches.map((email) => email.address).sort()).toEqual([
      "alpha-open@moemail.app",
      "alpha-pinned@moemail.app",
    ])

    const result = listEmailsQuery(db, { search: "alpha", userId })

    expect(result.pinned.map((email) => email.id)).toEqual([matchingPinned.id])
    expect(result.emails.map((email) => email.id)).toEqual([matchingUnpinned.id])
  })

  it("counts only search matches in the total", () => {
    const userId = createTestUser(db)
    createTestEmail(db, userId, { address: "match-one@moemail.app" })
    createTestEmail(db, userId, { address: "match-two@moemail.app" })
    createTestEmail(db, userId, { address: "skip-me@moemail.app" })

    const result = listEmailsQuery(db, { search: "match", userId })

    expect(result.total).toBe(2)
  })
})

describe("permanent email filter query logic", () => {
  let db: TestDb

  beforeEach(() => {
    db = createDb()
  })

  afterEach(() => {
    cleanup(db)
  })

  it("returns only permanent emails when permanentOnly is enabled", () => {
    const userId = createTestUser(db)
    const permanent = createTestEmail(db, userId, {
      address: "forever@moemail.app",
      expiresAt: PERMANENT_THRESHOLD,
    })
    createTestEmail(db, userId, {
      address: "temporary@moemail.app",
      expiresAt: new Date(Date.now() + (EXPIRY_OPTIONS[0]?.value ?? 60_000)),
    })

    expect(PERMANENT_EXPIRY_OPTION?.value).toBe(0)

    const result = listEmailsQuery(db, { permanentOnly: true, userId })

    expect(result.emails.map((email) => email.id)).toEqual([permanent.id])
  })

  it("combines permanent filtering and search across pinned and unpinned emails", () => {
    const userId = createTestUser(db)
    const permanentPinned = createTestEmail(db, userId, {
      address: "alpha-forever-pinned@moemail.app",
      expiresAt: PERMANENT_THRESHOLD,
      pinnedAt: new Date("2026-01-09T00:00:00.000Z"),
    })
    const permanentUnpinned = createTestEmail(db, userId, {
      address: "alpha-forever-open@moemail.app",
      expiresAt: PERMANENT_THRESHOLD,
    })
    createTestEmail(db, userId, {
      address: "alpha-temporary@moemail.app",
      expiresAt: new Date(Date.now() + (EXPIRY_OPTIONS[1]?.value ?? 120_000)),
    })

    const result = listEmailsQuery(db, {
      permanentOnly: true,
      search: "alpha",
      userId,
    })

    expect(result.pinned.map((email) => email.id)).toEqual([permanentPinned.id])
    expect(result.emails.map((email) => email.id)).toEqual([permanentUnpinned.id])
  })
})
