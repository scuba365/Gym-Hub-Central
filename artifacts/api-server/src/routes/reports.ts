import { Router } from "express";
import { GOTEAMUP_BASE, PAGE_SIZE, goteamupFetch, goteamupFetchAll } from "../lib/goteamup";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { clientsTable, attendanceRecordsTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";

const router = Router();

// GoTeamUp customer_membership — use `any` internally so we can inspect
// the actual shape at runtime and handle nested objects or plain IDs.
interface GoTeamUpMembership {
  id: number;
  customer: number;
  membership: any; // may be a plan ID (number) or nested object { id, price, ... }
  name: string;
  status: string;
  start_date: string | null;
  expiration_date: string | null;
  price?: string | number | null; // sometimes present directly on the assignment
}

interface GoTeamUpMembershipPlan {
  id: number;
  name: string;
  price: string | number | null;
}

// Extract a price from a raw customer_membership record (handles multiple shapes)
function extractPrice(mem: GoTeamUpMembership): number {
  // 1. Direct price field on the assignment
  if (mem.price != null) {
    const p = typeof mem.price === "string" ? parseFloat(mem.price) : Number(mem.price);
    if (!isNaN(p) && p > 0) return p;
  }
  // 2. Nested membership object { price: "50.00", ... }
  if (mem.membership != null && typeof mem.membership === "object") {
    const nested = mem.membership as Record<string, any>;
    const p = typeof nested.price === "string" ? parseFloat(nested.price) : Number(nested.price ?? 0);
    if (!isNaN(p) && p > 0) return p;
  }
  return 0;
}

// Extract the plan ID from a membership (handles number or nested object)
function extractPlanId(mem: GoTeamUpMembership): number | null {
  if (mem.membership == null) return null;
  if (typeof mem.membership === "number") return mem.membership;
  if (typeof mem.membership === "object") return (mem.membership as any).id ?? null;
  return null;
}

// 10-minute caches
let membershipCache: { data: GoTeamUpMembership[]; at: number } | null = null;
let planPriceCache: { data: Map<number, number>; at: number } | null = null;
const CACHE_MS = 10 * 60 * 1000;

async function getMemberships(token: string): Promise<GoTeamUpMembership[]> {
  if (membershipCache && Date.now() - membershipCache.at < CACHE_MS) {
    return membershipCache.data;
  }
  const data = await goteamupFetchAll<GoTeamUpMembership>(
    `${GOTEAMUP_BASE}/customer_memberships?page_size=${PAGE_SIZE}`,
    token
  );
  // Log sample so we can see all field names in Replit logs
  if (data.length > 0) {
    logger.info({ keys: Object.keys(data[0]), sample: data[0] }, "Reports: customer_membership sample");
  }
  membershipCache = { data, at: Date.now() };
  logger.info({ count: data.length }, "Reports: fetched and cached memberships");
  return data;
}

interface GoTeamUpSubscription {
  id: number;
  customer: number | { id: number; [key: string]: any };
  [key: string]: any; // capture all fields for logging
}

// Fetch payment subscriptions and build customer_id → monthly_amount map
async function getSubscriptionAmounts(token: string): Promise<Map<number, number>> {
  if (planPriceCache && Date.now() - planPriceCache.at < CACHE_MS) {
    return planPriceCache.data;
  }
  try {
    const subs = await goteamupFetchAll<GoTeamUpSubscription>(
      `${GOTEAMUP_BASE}/payment_subscriptions?page_size=${PAGE_SIZE}`,
      token
    );
    if (subs.length > 0) {
      logger.info({ keys: Object.keys(subs[0]), sample: subs[0] }, "Reports: payment_subscription sample");
    }
    const map = new Map<number, number>();
    for (const s of subs) {
      const customerId = typeof s.customer === "object" ? s.customer?.id : s.customer;
      if (!customerId) continue;
      // Try every common field name for the amount
      const raw = s.amount ?? s.billing_amount ?? s.price ?? s.cost ?? s.fee ?? s.total ?? null;
      const amount = typeof raw === "string" ? parseFloat(raw) : Number(raw ?? 0);
      if (!isNaN(amount) && amount > 0) map.set(Number(customerId), amount);
    }
    logger.info({ subscriptions: subs.length, withAmount: map.size }, "Reports: payment subscriptions loaded");
    planPriceCache = { data: map, at: Date.now() };
    return map;
  } catch (err) {
    logger.warn({ err }, "Reports: payment_subscriptions endpoint failed");
    return new Map();
  }
}

// Persistent name cache — survives drilldown clicks within the same process lifetime
const customerNameCache = new Map<number, string>();

/**
 * Batch-resolve GoTeamUp customer IDs to display names.
 * Priority: (1) DB, (2) in-process name cache, (3) GoTeamUp /customers/:id fallback.
 * Unknown IDs are resolved concurrently and added to the cache.
 */
async function resolveNames(customerIds: number[], token: string): Promise<Map<number, string>> {
  if (customerIds.length === 0) return new Map();

  const map = new Map<number, string>();

  // 1. Populate from in-process cache
  const needsDb: number[] = [];
  for (const id of customerIds) {
    const cached = customerNameCache.get(id);
    if (cached) map.set(id, cached);
    else needsDb.push(id);
  }

  // 2. Batch DB lookup for the rest
  if (needsDb.length > 0) {
    const rows = await db
      .select({ teamupId: clientsTable.teamupId, name: clientsTable.name })
      .from(clientsTable)
      .where(inArray(clientsTable.teamupId, needsDb.map(String)));
    for (const r of rows) {
      if (r.teamupId) {
        const id = Number(r.teamupId);
        map.set(id, r.name);
        customerNameCache.set(id, r.name);
      }
    }
  }

  // 3. For IDs still not found, fall back to GoTeamUp /customers/:id
  const stillMissing = customerIds.filter(id => !map.has(id));
  if (stillMissing.length > 0) {
    const results = await Promise.all(
      stillMissing.map(async id => {
        try {
          const c = await goteamupFetch(`${GOTEAMUP_BASE}/customers/${id}`, token) as {
            first_name?: string;
            last_name?: string;
          };
          const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || null;
          return { id, name };
        } catch {
          return { id, name: null };
        }
      })
    );
    for (const { id, name } of results) {
      if (name) {
        map.set(id, name);
        customerNameCache.set(id, name);
      }
    }
  }

  return map;
}

function monthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

function monthEnd(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isActiveInMonth(mem: GoTeamUpMembership, start: Date, end: Date): boolean {
  if (!mem.start_date) return false;
  const s = new Date(mem.start_date);
  if (isNaN(s.getTime()) || s > end) return false;
  if (!mem.expiration_date) return true;
  const e = new Date(mem.expiration_date);
  return !isNaN(e.getTime()) && e >= start;
}

function uniqueCustomers(mems: GoTeamUpMembership[]): number {
  return new Set(mems.map(m => m.customer)).size;
}

/**
 * Returns true if the customer re-signed within 30 days after this membership expired.
 * This prevents trial→full-membership transitions from being counted as churn.
 */
function hasImmediateRenewal(mem: GoTeamUpMembership, allMemberships: GoTeamUpMembership[]): boolean {
  if (!mem.expiration_date) return false;
  const expiry = new Date(mem.expiration_date);
  const cutoff = new Date(expiry.getTime() + 30 * 24 * 60 * 60 * 1000);
  return allMemberships.some(other => {
    if (other.customer !== mem.customer || other.id === mem.id || !other.start_date) return false;
    const otherStart = new Date(other.start_date);
    return otherStart > expiry && otherStart <= cutoff;
  });
}

function getChurnedMemberships(
  memberships: GoTeamUpMembership[],
  mStart: Date,
  mEnd: Date
): GoTeamUpMembership[] {
  // Customers with an ongoing membership (started before/during month, extends beyond)
  const activeAfter = new Set(
    memberships
      .filter(mem => {
        if (!mem.start_date) return false;
        const s = new Date(mem.start_date);
        if (isNaN(s.getTime()) || s > mEnd) return false;
        if (!mem.expiration_date) return true;
        const e = new Date(mem.expiration_date);
        return !isNaN(e.getTime()) && e > mEnd;
      })
      .map(mem => mem.customer)
  );

  return memberships.filter(mem => {
    if (!mem.expiration_date) return false;
    if (!["expired", "cancelled", "ended"].includes(mem.status)) return false;
    const e = new Date(mem.expiration_date);
    if (isNaN(e.getTime()) || e < mStart || e > mEnd) return false;
    if (activeAfter.has(mem.customer)) return false;
    // Not churned if they immediately re-signed (trial → full membership etc.)
    if (hasImmediateRenewal(mem, memberships)) return false;
    return true;
  });
}

// GET /reports/membership
router.get("/reports/membership", async (req, res) => {
  const token = process.env.TEAMUP_M2M_TOKEN;
  if (!token) {
    return res.status(503).json({ error: "TeamUp credentials not configured (TEAMUP_M2M_TOKEN)" });
  }

  try {
    const [memberships, subscriptionAmounts] = await Promise.all([
      getMemberships(token),
      getSubscriptionAmounts(token),
    ]);

    // Build 13 months of boundaries: [13 months ago ... current month]
    const now = new Date();
    const months: Array<{ key: string; start: Date; end: Date }> = [];
    for (let i = 12; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push({
        key: monthKey(d),
        start: monthStart(d.getUTCFullYear(), d.getUTCMonth()),
        end: monthEnd(d.getUTCFullYear(), d.getUTCMonth()),
      });
    }

    // Revenue: for each month, sum subscription amounts of all active members.
    // Falls back to direct price fields on the customer_membership record if
    // no subscription amount is found.
    const revenueForMonth = (mStart: Date, mEnd: Date): number => {
      let total = 0;
      const seen = new Set<number>();
      for (const mem of memberships) {
        if (seen.has(mem.customer)) continue;
        if (!isActiveInMonth(mem, mStart, mEnd)) continue;
        seen.add(mem.customer);
        const amount = subscriptionAmounts.get(mem.customer) ?? extractPrice(mem);
        total += amount;
      }
      return Math.round(total * 100) / 100;
    };

    const result = months.slice(1).map((m, idx) => {
      const prevMonth = months[idx];

      const active = memberships.filter(mem => isActiveInMonth(mem, m.start, m.end));
      const activeAtStartOfMonth = memberships.filter(mem =>
        isActiveInMonth(mem, prevMonth.start, prevMonth.end)
      );

      const newMembers = memberships.filter(mem => {
        if (!mem.start_date) return false;
        const s = new Date(mem.start_date);
        if (isNaN(s.getTime()) || s < m.start || s > m.end) return false;
        return !memberships.some(
          other => other.customer === mem.customer && other.id !== mem.id &&
            other.start_date && new Date(other.start_date) < m.start
        );
      });

      const churned = getChurnedMemberships(memberships, m.start, m.end);

      const denominator = uniqueCustomers(activeAtStartOfMonth);
      const churnedCount = new Set(churned.map(m => m.customer)).size;

      return {
        month: m.key,
        activeMembers: uniqueCustomers(active),
        newMembers: uniqueCustomers(newMembers),
        churnedMembers: churnedCount,
        churnPct: denominator > 0 ? Math.round((churnedCount / denominator) * 1000) / 10 : 0,
        revenue: revenueForMonth(m.start, m.end),
      };
    });

    const currentMonth = result[result.length - 1];
    const prevMonthResult = result[result.length - 2];
    const momChange = currentMonth && prevMonthResult
      ? currentMonth.activeMembers - prevMonthResult.activeMembers
      : 0;

    const revenueTrailing12m = Math.round(
      result.reduce((sum, m) => sum + m.revenue, 0) * 100
    ) / 100;

    // Breakdown of active memberships this month by plan name
    const currentBoundary = months[months.length - 1];
    const activeMembershipsNow = memberships.filter(mem =>
      isActiveInMonth(mem, currentBoundary.start, currentBoundary.end)
    );
    const breakdownMap = new Map<string, number>();
    for (const mem of activeMembershipsNow) {
      const name = mem.name?.trim() || "Unknown";
      breakdownMap.set(name, (breakdownMap.get(name) ?? 0) + 1);
    }
    const membershipBreakdown = Array.from(breakdownMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Upcoming expirations: active memberships expiring within 30 days
    const todayStr = new Date().toISOString().split("T")[0];
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().split("T")[0];

    const expiringByCustomer = new Map<number, GoTeamUpMembership>();
    for (const mem of memberships) {
      if (mem.status !== "active" || !mem.expiration_date) continue;
      if (mem.expiration_date < todayStr || mem.expiration_date > in30Str) continue;
      const existing = expiringByCustomer.get(mem.customer);
      if (!existing || mem.expiration_date > existing.expiration_date!) {
        expiringByCustomer.set(mem.customer, mem);
      }
    }

    const expiringIds = Array.from(expiringByCustomer.keys());
    const expiringNames = await resolveNames(expiringIds, token);
    const upcomingExpirations = expiringIds
      .map(id => {
        const mem = expiringByCustomer.get(id)!;
        return {
          name: expiringNames.get(id) ?? `Member #${id}`,
          planName: mem.name,
          expiresOn: mem.expiration_date!,
        };
      })
      .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
    logger.info({ count: upcomingExpirations.length }, "Reports: upcoming expirations");

    return res.json({
      months: result,
      current: { activeMembers: currentMonth?.activeMembers ?? 0, revenueTrailing12m, momChange },
      membershipBreakdown,
      upcomingExpirations,
    });
  } catch (err) {
    logger.error({ err }, "Reports: membership report failed");
    return res.status(500).json({ error: (err as Error).message || "Failed to generate report" });
  }
});

// GET /reports/membership/drilldown?month=2026-07&category=active|new|churned
router.get("/reports/membership/drilldown", async (req, res) => {
  const token = process.env.TEAMUP_M2M_TOKEN;
  if (!token) {
    return res.status(503).json({ error: "TeamUp credentials not configured (TEAMUP_M2M_TOKEN)" });
  }

  const { month, category } = req.query as { month?: string; category?: string };
  if (!month || !category) {
    return res.status(400).json({ error: "month (YYYY-MM) and category (active|new|churned) are required" });
  }
  if (!["active", "new", "churned"].includes(category)) {
    return res.status(400).json({ error: "category must be active, new, or churned" });
  }
  const parts = month.split("-");
  const year = parseInt(parts[0]), monthIdx = parseInt(parts[1]) - 1;
  if (isNaN(year) || isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) {
    return res.status(400).json({ error: "Invalid month format — use YYYY-MM" });
  }

  try {
    const memberships = await getMemberships(token);
    const mStart = monthStart(year, monthIdx);
    const mEnd = monthEnd(year, monthIdx);

    let filtered: GoTeamUpMembership[] = [];

    if (category === "active") {
      filtered = memberships.filter(mem => isActiveInMonth(mem, mStart, mEnd));
    } else if (category === "new") {
      filtered = memberships.filter(mem => {
        if (!mem.start_date) return false;
        const s = new Date(mem.start_date);
        if (isNaN(s.getTime()) || s < mStart || s > mEnd) return false;
        return !memberships.some(
          other => other.customer === mem.customer && other.id !== mem.id &&
            other.start_date && new Date(other.start_date) < mStart
        );
      });
    } else {
      filtered = getChurnedMemberships(memberships, mStart, mEnd);
    }

    // Deduplicate by customer — keep first membership encountered per customer
    const byCustomer = new Map<number, GoTeamUpMembership>();
    for (const mem of filtered) {
      if (!byCustomer.has(mem.customer)) byCustomer.set(mem.customer, mem);
    }

    const customerIds = Array.from(byCustomer.keys());
    const nameMap = await resolveNames(customerIds, token);

    const members = customerIds
      .map(id => {
        const mem = byCustomer.get(id)!;
        return {
          name: nameMap.get(id) ?? `Member #${id}`,
          planName: mem.name,
          startDate: mem.start_date,
          expiresOn: mem.expiration_date,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    logger.info({ month, category, count: members.length }, "Reports: drilldown");
    return res.json({ month, category, members });
  } catch (err) {
    logger.error({ err }, "Reports: drilldown failed");
    return res.status(500).json({ error: (err as Error).message || "Drilldown failed" });
  }
});

// GET /reports/attendance-heatmap
router.get("/reports/attendance-heatmap", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        class_name AS "className",
        EXTRACT(DOW FROM date::date)::integer AS "dayOfWeek",
        COUNT(*)::integer AS "totalBookings",
        COUNT(DISTINCT date)::integer AS "totalSessions"
      FROM attendance_records
      WHERE class_name IS NOT NULL AND class_name != ''
      GROUP BY class_name, EXTRACT(DOW FROM date::date)
      ORDER BY class_name, EXTRACT(DOW FROM date::date)
    `);

    const result = (rows.rows as any[]).map(r => ({
      className: String(r.className),
      dayOfWeek: Number(r.dayOfWeek),
      totalSessions: Number(r.totalSessions),
      avgAttendance: Math.round((Number(r.totalBookings) / Number(r.totalSessions)) * 10) / 10,
    }));

    logger.info({ count: result.length }, "Reports: attendance heatmap");
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "Reports: attendance heatmap failed");
    return res.status(500).json({ error: "Failed to fetch attendance heatmap" });
  }
});

// GET /reports/cohort-retention
router.get("/reports/cohort-retention", async (req, res) => {
  const token = process.env.TEAMUP_M2M_TOKEN;
  if (!token) {
    return res.status(503).json({ error: "TeamUp credentials not configured (TEAMUP_M2M_TOKEN)" });
  }

  try {
    const memberships = await getMemberships(token);

    // Find each customer's earliest membership start date
    const customerFirstJoin = new Map<number, Date>();
    for (const mem of memberships) {
      if (!mem.start_date) continue;
      const d = new Date(mem.start_date);
      if (isNaN(d.getTime())) continue;
      const existing = customerFirstJoin.get(mem.customer);
      if (!existing || d < existing) customerFirstJoin.set(mem.customer, d);
    }

    // Group customers into cohort months
    const cohortMap = new Map<string, number[]>();
    for (const [customerId, joinDate] of customerFirstJoin.entries()) {
      const key = monthKey(joinDate);
      if (!cohortMap.has(key)) cohortMap.set(key, []);
      cohortMap.get(key)!.push(customerId);
    }

    const isActiveAt = (customerId: number, checkDate: Date): boolean =>
      memberships.some(mem => {
        if (mem.customer !== customerId || !mem.start_date) return false;
        const s = new Date(mem.start_date);
        if (isNaN(s.getTime()) || s > checkDate) return false;
        if (!mem.expiration_date) return true;
        const e = new Date(mem.expiration_date);
        return !isNaN(e.getTime()) && e >= checkDate;
      });

    const now = new Date();

    const cohorts = Array.from(cohortMap.keys())
      .sort()
      .map(cohortMonth => {
        const [y, m] = cohortMonth.split("-").map(Number);
        const customerIds = cohortMap.get(cohortMonth)!;
        const size = customerIds.length;

        const retentionAt = (months: number): number | null => {
          const checkDate = new Date(Date.UTC(y, m - 1 + months, 1));
          if (checkDate > now) return null;
          const retained = customerIds.filter(id => isActiveAt(id, checkDate)).length;
          return Math.round((retained / size) * 1000) / 10;
        };

        return { cohort: cohortMonth, size, m1: retentionAt(1), m3: retentionAt(3), m6: retentionAt(6), m12: retentionAt(12) };
      });

    logger.info({ cohorts: cohorts.length }, "Reports: cohort retention");
    return res.json({ cohorts });
  } catch (err) {
    logger.error({ err }, "Reports: cohort retention failed");
    return res.status(500).json({ error: "Failed to compute cohort retention" });
  }
});

// GET /reports/debug/business-advisor — probe the TeamUp AI reports list
router.get("/reports/debug/business-advisor", async (req, res) => {
  const token = process.env.TEAMUP_M2M_TOKEN;
  if (!token) return res.status(503).json({ error: "TEAMUP_M2M_TOKEN not set" });

  try {
    const raw = await goteamupFetch<any>(`${GOTEAMUP_BASE}/ai/business_advisor_reports`, token);
    logger.info({ raw }, "Reports: business_advisor_reports probe");
    return res.json(raw);
  } catch (err) {
    logger.error({ err }, "Reports: business_advisor_reports probe failed");
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
