import { Router } from "express";
import { GOTEAMUP_BASE, PAGE_SIZE, goteamupFetchAll } from "../lib/goteamup";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const router = Router();

interface GoTeamUpMembership {
  id: number;
  customer: number;
  name: string;
  status: string;
  start_date: string | null;
  expiration_date: string | null;
}

interface GoTeamUpPayment {
  id: number;
  amount: string;
  created_at: string;
  status: string;
}

// 10-minute membership cache — avoids re-fetching GoTeamUp on drilldown clicks
let membershipCache: { data: GoTeamUpMembership[]; at: number } | null = null;
const CACHE_MS = 10 * 60 * 1000;

async function getMemberships(token: string): Promise<GoTeamUpMembership[]> {
  if (membershipCache && Date.now() - membershipCache.at < CACHE_MS) {
    return membershipCache.data;
  }
  const data = await goteamupFetchAll<GoTeamUpMembership>(
    `${GOTEAMUP_BASE}/customer_memberships?page_size=${PAGE_SIZE}`,
    token
  );
  membershipCache = { data, at: Date.now() };
  logger.info({ count: data.length }, "Reports: fetched and cached memberships");
  return data;
}

// Batch-resolve GoTeamUp customer IDs → names from our local DB
async function resolveNames(customerIds: number[]): Promise<Map<number, string>> {
  if (customerIds.length === 0) return new Map();
  const rows = await db
    .select({ teamupId: clientsTable.teamupId, name: clientsTable.name })
    .from(clientsTable)
    .where(inArray(clientsTable.teamupId, customerIds.map(String)));
  const map = new Map<number, string>();
  for (const r of rows) {
    if (r.teamupId) map.set(Number(r.teamupId), r.name);
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

// GET /reports/membership
router.get("/reports/membership", async (req, res) => {
  const token = process.env.TEAMUP_M2M_TOKEN;
  if (!token) {
    return res.status(503).json({ error: "TeamUp credentials not configured (TEAMUP_M2M_TOKEN)" });
  }

  try {
    const memberships = await getMemberships(token);

    // Fetch payments — graceful degradation if endpoint unavailable
    let payments: GoTeamUpPayment[] = [];
    try {
      payments = await goteamupFetchAll<GoTeamUpPayment>(
        `${GOTEAMUP_BASE}/payments?page_size=${PAGE_SIZE}`,
        token
      );
      logger.info({ count: payments.length }, "Reports: fetched payments");
    } catch (err) {
      logger.warn({ err }, "Reports: payments endpoint unavailable — revenue will show 0");
    }

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

    // Pre-index payments by month
    const paymentsByMonth = new Map<string, number>();
    for (const p of payments) {
      if (p.status === "failed" || p.status === "refunded") continue;
      if (!p.created_at) continue;
      const d = new Date(p.created_at);
      if (isNaN(d.getTime())) continue;
      const key = monthKey(d);
      paymentsByMonth.set(key, (paymentsByMonth.get(key) ?? 0) + (parseFloat(p.amount) || 0));
    }

    const result = months.slice(1).map((m, idx) => {
      const prevMonth = months[idx];

      const active = memberships.filter(mem => isActiveInMonth(mem, m.start, m.end));

      const activeAtStartOfMonth = memberships.filter(mem =>
        isActiveInMonth(mem, prevMonth.start, prevMonth.end)
      );

      const newMembers = memberships.filter(mem => {
        if (!mem.start_date) return false;
        const start = new Date(mem.start_date);
        if (isNaN(start.getTime()) || start < m.start || start > m.end) return false;
        return !memberships.some(
          other => other.customer === mem.customer && other.id !== mem.id &&
            other.start_date && new Date(other.start_date) < m.start
        );
      });

      const activeCustomerIdsAfterMonth = new Set(
        memberships
          .filter(mem => {
            if (!mem.start_date) return false;
            const s = new Date(mem.start_date);
            if (isNaN(s.getTime()) || s > m.end) return false;
            if (!mem.expiration_date) return true;
            const e = new Date(mem.expiration_date);
            return !isNaN(e.getTime()) && e > m.end;
          })
          .map(mem => mem.customer)
      );
      const churned = memberships.filter(mem => {
        if (!mem.expiration_date) return false;
        if (!["expired", "cancelled", "ended"].includes(mem.status)) return false;
        const e = new Date(mem.expiration_date);
        if (isNaN(e.getTime()) || e < m.start || e > m.end) return false;
        return !activeCustomerIdsAfterMonth.has(mem.customer);
      });

      const denominator = uniqueCustomers(activeAtStartOfMonth);
      const churnedCount = new Set(churned.map(m => m.customer)).size;

      return {
        month: m.key,
        activeMembers: uniqueCustomers(active),
        newMembers: uniqueCustomers(newMembers),
        churnedMembers: churnedCount,
        churnPct: denominator > 0 ? Math.round((churnedCount / denominator) * 1000) / 10 : 0,
        revenue: Math.round((paymentsByMonth.get(m.key) ?? 0) * 100) / 100,
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
    const expiringNames = await resolveNames(expiringIds);
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
      filtered = memberships.filter(mem => {
        if (!mem.expiration_date) return false;
        if (!["expired", "cancelled", "ended"].includes(mem.status)) return false;
        const e = new Date(mem.expiration_date);
        if (isNaN(e.getTime()) || e < mStart || e > mEnd) return false;
        return !activeAfter.has(mem.customer);
      });
    }

    // Deduplicate by customer — keep the membership most relevant to this query
    const byCustomer = new Map<number, GoTeamUpMembership>();
    for (const mem of filtered) {
      if (!byCustomer.has(mem.customer)) byCustomer.set(mem.customer, mem);
    }

    const customerIds = Array.from(byCustomer.keys());
    const nameMap = await resolveNames(customerIds);

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

export default router;
