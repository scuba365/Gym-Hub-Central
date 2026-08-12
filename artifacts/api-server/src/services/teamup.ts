import { db } from "@workspace/db";
import { clientsTable, attendanceRecordsTable } from "@workspace/db";
import { eq, gt, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { GOTEAMUP_BASE, PAGE_SIZE, goteamupFetch, type PaginatedResponse } from "../lib/goteamup";

const SYNC_DAYS = 28;

/**
 * Strip all non-digit characters and return a canonical phone string.
 * Returns null if the result is empty or too short to be a valid number.
 * This matches InBody's MemberID format (digits only).
 */
function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

interface GoTeamUpCustomer {
  id: number;
  first_name: string;
  last_name: string;
  email?: string;
  phone_number?: string;
  mobile?: string;
}

interface GoTeamUpEvent {
  id: number;
  name: string;
  starts_at: string;
}

interface GoTeamUpAttendance {
  id: number;
  customer: number;
  event: number;
  status: string;
}


/** Returns GoTeamUp customer IDs that have an active customer_membership. */
async function fetchActiveCustomerIds(token: string): Promise<Set<number>> {
  const ids = new Set<number>();
  let nextUrl: string | null = `${GOTEAMUP_BASE}/customer_memberships?page_size=${PAGE_SIZE}&status=active`;
  while (nextUrl) {
    const data = await goteamupFetch(nextUrl, token) as PaginatedResponse<{ customer: number }>;
    for (const m of data.results) {
      if (m.customer) ids.add(m.customer);
    }
    nextUrl = data.next || null;
  }
  return ids;
}

/** Fetches all customers and filters to only the active set. */
async function fetchActiveCustomers(
  token: string,
  activeIds: Set<number>
): Promise<GoTeamUpCustomer[]> {
  const active: GoTeamUpCustomer[] = [];
  let nextUrl: string | null = `${GOTEAMUP_BASE}/customers?page_size=${PAGE_SIZE}&participating=true`;
  while (nextUrl) {
    const data = await goteamupFetch(nextUrl, token) as PaginatedResponse<GoTeamUpCustomer>;
    for (const c of data.results) {
      if (activeIds.has(c.id)) active.push(c);
    }
    nextUrl = data.next || null;
  }
  return active;
}

/**
 * Fetches events from the last SYNC_DAYS days using the starts_at_gte filter
 * (confirmed working: returns only events >= the given date).
 */
async function fetchRecentEvents(token: string, cutoffDate: string): Promise<GoTeamUpEvent[]> {
  const todayStr = new Date().toISOString().split("T")[0];
  const all: GoTeamUpEvent[] = [];
  let nextUrl: string | null =
    `${GOTEAMUP_BASE}/events?page_size=${PAGE_SIZE}&starts_at_gte=${cutoffDate}&starts_at_lte=${todayStr}`;
  let pages = 0;
  while (nextUrl && pages < 30) {
    const data = await goteamupFetch(nextUrl, token) as PaginatedResponse<GoTeamUpEvent>;
    for (const ev of data.results) {
      // Belt-and-suspenders: skip any event that starts in the future
      // (in case starts_at_lte is ignored by the API)
      const evDate = ev.starts_at?.split("T")[0];
      if (evDate && evDate <= todayStr) {
        all.push(ev);
      }
    }
    nextUrl = data.next || null;
    pages++;
  }
  return all;
}

/**
 * Fetches a single customer's attendances, newest first.
 * Stops as soon as 2 consecutive pages have no events in our recent window
 * (meaning we've scrolled back past the sync window).
 */
async function fetchCustomerRecentAttendances(
  token: string,
  customerId: number,
  recentEventIds: Set<number>
): Promise<GoTeamUpAttendance[]> {
  const matched: GoTeamUpAttendance[] = [];
  let nextUrl: string | null =
    `${GOTEAMUP_BASE}/attendances?customer=${customerId}&page_size=${PAGE_SIZE}&ordering=-id`;
  let consecutiveEmpty = 0;
  let pages = 0;

  while (nextUrl && pages < 10) {
    const data = await goteamupFetch(nextUrl, token) as PaginatedResponse<GoTeamUpAttendance>;
    let found = 0;
    for (const att of data.results) {
      if (recentEventIds.has(att.event) && att.status !== "not_registered") {
        matched.push(att);
        found++;
      }
    }
    consecutiveEmpty = found > 0 ? 0 : consecutiveEmpty + 1;
    if (consecutiveEmpty >= 2) break;
    nextUrl = data.next || null;
    pages++;
  }

  return matched;
}

export async function syncTeamup(): Promise<{ clientsUpdated: number; attendanceAdded: number }> {
  const token = process.env.TEAMUP_M2M_TOKEN;

  if (!token) {
    logger.warn("GoTeamUp credentials not configured (TEAMUP_M2M_TOKEN)");
    return { clientsUpdated: 0, attendanceAdded: 0 };
  }

  let clientsUpdated = 0;
  let attendanceAdded = 0;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - SYNC_DAYS);
  const cutoffStr = cutoffDate.toISOString().split("T")[0];

  try {
    // 0. Purge any attendance records with dates in the future — these are
    //    advance registrations that slipped through without an upper-bound filter.
    const todayStr = new Date().toISOString().split("T")[0];
    const deleted = await db
      .delete(attendanceRecordsTable)
      .where(gt(attendanceRecordsTable.date, todayStr))
      .returning({ id: attendanceRecordsTable.id });
    if (deleted.length > 0) {
      logger.info({ count: deleted.length }, "GoTeamUp: purged future-dated attendance records");
    }

    // 1. Fetch active customer IDs (only those with active memberships)
    logger.info("GoTeamUp: fetching active customer IDs...");
    const activeIds = await fetchActiveCustomerIds(token);
    logger.info({ count: activeIds.size }, "GoTeamUp: active membership holders");

    // 2. Fetch all customers (participating), keep only active ones
    const activeCustomers = await fetchActiveCustomers(token, activeIds);
    logger.info({ count: activeCustomers.length }, "GoTeamUp: active customers fetched");

    // 3. Upsert active customers to DB
    const customerDbMap = new Map<number, number>(); // GoTeamUp ID → DB ID

    for (const c of activeCustomers) {
      const name = `${c.first_name} ${c.last_name}`.trim();
      const email = c.email?.toLowerCase() || null;
      const teamupId = String(c.id);
      // GoTeamUp returns phone as phone_number or mobile depending on API version
      const phone = normalisePhone(c.phone_number || c.mobile || null);

      let client = null;
      if (email) {
        const found = await db.select().from(clientsTable).where(eq(clientsTable.email, email)).limit(1);
        client = found[0];
      }
      if (!client && phone) {
        const found = await db.select().from(clientsTable).where(eq(clientsTable.phone, phone)).limit(1);
        client = found[0];
      }
      if (!client) {
        const found = await db.select().from(clientsTable).where(eq(clientsTable.teamupId, teamupId)).limit(1);
        client = found[0];
      }
      // Name fallback: only use if unambiguous (exactly one match)
      if (!client) {
        const normalizedName = name.toLowerCase().trim();
        const found = await db
          .select()
          .from(clientsTable)
          .where(sql`LOWER(TRIM(${clientsTable.name})) = ${normalizedName}`)
          .limit(2);
        if (found.length === 1) client = found[0];
      }

      if (!client) {
        const [newClient] = await db.insert(clientsTable).values({ name, email, phone, teamupId }).returning();
        client = newClient;
        clientsUpdated++;
      } else {
        // Always keep phone and teamupId up to date
        const updates: Record<string, unknown> = {};
        if (!client.teamupId) updates.teamupId = teamupId;
        if (phone && !client.phone) updates.phone = phone;
        if (Object.keys(updates).length > 0) {
          await db.update(clientsTable).set(updates).where(eq(clientsTable.id, client.id));
        }
      }

      customerDbMap.set(c.id, client.id);
    }

    // 4. Fetch recent events to build eventId → date lookup
    logger.info({ cutoffStr }, "GoTeamUp: fetching recent events...");
    const recentEvents = await fetchRecentEvents(token, cutoffStr);
    logger.info({ count: recentEvents.length }, "GoTeamUp: recent events fetched");

    const eventDateMap = new Map<number, string>();
    const eventNameMap = new Map<number, string>();
    for (const ev of recentEvents) {
      const date = ev.starts_at?.split("T")[0];
      if (date) {
        eventDateMap.set(ev.id, date);
        eventNameMap.set(ev.id, ev.name);
      }
    }
    const recentEventIdSet = new Set(eventDateMap.keys());

    // 5. Fetch attendances per active customer (in batches of 5 to stay fast)
    logger.info({ customers: customerDbMap.size }, "GoTeamUp: fetching per-customer attendances...");
    const entries = Array.from(customerDbMap.entries());

    for (let i = 0; i < entries.length; i += 5) {
      const batch = entries.slice(i, i + 5);
      await Promise.all(
        batch.map(async ([goTeamUpId, dbId]) => {
          const attendances = await fetchCustomerRecentAttendances(
            token,
            goTeamUpId,
            recentEventIdSet
          );
          for (const att of attendances) {
            const date = eventDateMap.get(att.event);
            if (!date) continue;
            const externalId = `goteamup-att-${att.id}`;
            const existing = await db
              .select()
              .from(attendanceRecordsTable)
              .where(eq(attendanceRecordsTable.externalId, externalId))
              .limit(1);
            if (existing.length === 0) {
              await db.insert(attendanceRecordsTable).values({
                clientId: dbId,
                date,
                className: eventNameMap.get(att.event) || null,
                externalId,
              });
              attendanceAdded++;
            }
          }
        })
      );
    }

    // 6. Recalculate weekly attendance averages for ALL clients with attendance records
    // (not just the ones in this sync window, so name-matched clients get corrected too)
    const allAttendees = await db
      .selectDistinct({ clientId: attendanceRecordsTable.clientId })
      .from(attendanceRecordsTable);
    await recalculateAttendanceAverages(allAttendees.map((r) => r.clientId), cutoffStr);
  } catch (err) {
    logger.error({ err }, "GoTeamUp sync error");
    throw err;
  }

  return { clientsUpdated, attendanceAdded };
}

async function recalculateAttendanceAverages(clientDbIds: number[], cutoffStr: string) {
  const now = new Date();
  for (const clientId of clientDbIds) {
    const records = await db
      .select()
      .from(attendanceRecordsTable)
      .where(eq(attendanceRecordsTable.clientId, clientId));

    const recent = records.filter((r) => r.date >= cutoffStr);
    const weeklyAvg = recent.length / 4;
    const lastRecord = records.sort((a, b) => b.date.localeCompare(a.date))[0];

    await db.update(clientsTable).set({
      weeklyAttendanceAvg: weeklyAvg,
      lastAttendanceDate: lastRecord?.date || null,
      lastSyncedAt: now.toISOString(),
    }).where(eq(clientsTable.id, clientId));
  }
}
