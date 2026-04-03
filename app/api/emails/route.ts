import { createDb } from "@/lib/db"
import { and, eq, gt, gte, lt, or, sql, isNotNull, desc } from "drizzle-orm"
import { NextResponse } from "next/server"
import { emails } from "@/lib/schema"
import { encodeCursor, decodeCursor } from "@/lib/cursor"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

const PAGE_SIZE = 20
const PERMANENT_DATE = new Date('9999-01-01T00:00:00.000Z')

export async function GET(request: Request) {
  const userId = await getUserId()

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const search = searchParams.get('search') || undefined
  const permanent = searchParams.get('permanent') === 'true'
  
  const db = createDb()

  try {
    const pinnedConditions = [
      eq(emails.userId, userId!),
      isNotNull(emails.pinnedAt),
      gt(emails.expiresAt, new Date())
    ]
    if (search) {
      pinnedConditions.push(sql`LOWER(${emails.address}) LIKE LOWER(${'%' + search + '%'})`)
    }
    if (permanent) {
      pinnedConditions.push(gte(emails.expiresAt, PERMANENT_DATE))
    }

    const pinnedEmails = await db.query.emails.findMany({
      where: and(...pinnedConditions),
      orderBy: [desc(emails.pinnedAt)],
    })

    const baseConditions = and(
      eq(emails.userId, userId!),
      gt(emails.expiresAt, new Date()),
      sql`${emails.pinnedAt} IS NULL`
    )

    const countConditions = [baseConditions]
    if (search) {
      countConditions.push(sql`LOWER(${emails.address}) LIKE LOWER(${'%' + search + '%'})`)
    }
    if (permanent) {
      countConditions.push(gte(emails.expiresAt, PERMANENT_DATE))
    }

    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(and(...countConditions))
    const totalCount = Number(totalResult[0].count)

    const conditions = [...countConditions]

    if (cursor) {
      const { timestamp, id } = decodeCursor(cursor)
      conditions.push(
        or(
          lt(emails.createdAt, new Date(timestamp)),
          and(
            eq(emails.createdAt, new Date(timestamp)),
            lt(emails.id, id)
          )
        )
      )
    }

    const results = await db.query.emails.findMany({
      where: and(...conditions),
      orderBy: [desc(emails.createdAt), desc(emails.id)],
      limit: PAGE_SIZE + 1
    })
    
    const hasMore = results.length > PAGE_SIZE
    const nextCursor = hasMore 
      ? encodeCursor(
          results[PAGE_SIZE - 1].createdAt.getTime(),
          results[PAGE_SIZE - 1].id
        )
      : null
    const emailList = hasMore ? results.slice(0, PAGE_SIZE) : results

    return NextResponse.json({ 
      pinned: pinnedEmails,
      emails: emailList,
      nextCursor,
      total: totalCount
    })
  } catch (error) {
    console.error('Failed to fetch user emails:', error)
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    )
  }
} 