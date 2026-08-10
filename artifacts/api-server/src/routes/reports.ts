import { Router } from "express";
import { GOTEAMUP_BASE, PAGE_SIZE, goteamupFetch, goteamupFetchAll } from "../lib/goteamup";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

function monthEnd(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
}

// GET /reports/membership
router.get("/reports/membership", async (req, res) => {
  const token = process.env.TEAMUP_M2M_TOKEN;
  if (!token) {
    return res.status(503).json({ error: "TeamUp credentials not configured (TEAMUP_M2M_TOKEN)" });
  }

  try {
    // Fetch all memberships (no status filter — we want historical data too)
    const memberships = await goteamupFetchAll<GoTeamUpMembership>(
      `${GOTEAMUP_BASE}/customer_memberships?page_size=${PAGE_SIZE}`,
      token
    );
    logger.info({ count: memberships.length }, "Reports: fetched memberships");

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
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      months.push({
        key: monthKey(d),
        start: monthStart(year, month),
        end: monthEnd(year, month),
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
      const amount = parseFloat(p.amount) || 0;
      paymentsByMonth.set(key, (paymentsByMonth.get(key) ?? 0) + amount);
    }

    // Helper: unique customer count from a membership list
    function uniqueCustomers(mems: GoTeamUpMembership[]): number {
      return new Set(mems.map(m => m.customer)).size;
    }

    // Compute per-month metrics (skip index 0, it's only used as "previous" for index 1)
    const result = months.slice(1).map((m, idx) => {
      const prevMonth = months[idx]; // one earlier

      // Active = unique customers with a membership overlapping this month
      const active = memberships.filter(mem => {
        if (!mem.start_date) return false;
        const start = new Date(mem.start_date);
        if (isNaN(start.getTime()) || start > m.end) return false;
        if (!mem.expiration_date) return true;
        const end = new Date(mem.expiration_date);
        return !isNaN(end.getTime()) && end >= m.start;
      });

      // Active at start of this month (= active during previous month) — for churn denominator
      const activeAtStartOfMonth = memberships.filter(mem => {
        if (!mem.start_date) return false;
        const start = new Date(mem.start_date);
        if (isNaN(start.getTime()) || start > prevMonth.end) return false;
        if (!mem.expiration_date) return true;
        const end = new Date(mem.expiration_date);
        return !isNaN(end.getTime()) && end >= prevMonth.start;
      });

      // New = unique customers who started a membership this month and had none before
      const activeCustomerIdsThisMonth = new Set(active.map(m => m.customer));
      const newMembers = memberships.filter(mem => {
        if (!mem.start_date) return false;
        const start = new Date(mem.start_date);
        if (isNaN(start.getTime()) || start < m.start || start > m.end) return false;
        // Only count if this customer had no earlier membership before this month
        const hadPrior = memberships.some(
          other => other.customer === mem.customer && other.id !== mem.id &&
            other.start_date && new Date(other.start_date) < m.start
        );
        return !hadPrior;
      });

      // Churned = unique customers whose membership ended this month with no remaining active membership
      const activeCustomerIdsAfterMonth = new Set(
        memberships
          .filter(mem => {
            if (!mem.start_date) return false;
            const start = new Date(mem.start_date);
            if (isNaN(start.getTime()) || start > m.end) return false;
            if (!mem.expiration_date) return true;
            const end = new Date(mem.expiration_date);
            return !isNaN(end.getTime()) && end > m.end;
          })
          .map(mem => mem.customer)
      );
      const churned = memberships.filter(mem => {
        if (!mem.expiration_date) return false;
        if (!["expired", "cancelled", "ended"].includes(mem.status)) return false;
        const end = new Date(mem.expiration_date);
        if (isNaN(end.getTime()) || end < m.start || end > m.end) return false;
        // Only count if this customer has no membership that extends beyond this month
        return !activeCustomerIdsAfterMonth.has(mem.customer);
      });

      const denominator = uniqueCustomers(activeAtStartOfMonth);
      const churnedCount = new Set(churned.map(m => m.customer)).size;
      const churnPct = denominator > 0
        ? Math.round((churnedCount / denominator) * 1000) / 10
        : 0;

      return {
        month: m.key,
        activeMembers: uniqueCustomers(active),
        newMembers: uniqueCustomers(newMembers),
        churnedMembers: churnedCount,
        churnPct,
        revenue: Math.round((paymentsByMonth.get(m.key) ?? 0) * 100) / 100,
      };
    });

    // Current snapshot (last entry = current month)
    const currentMonth = result[result.length - 1];
    const prevMonth = result[result.length - 2];
    const momChange = currentMonth && prevMonth
      ? currentMonth.activeMembers - prevMonth.activeMembers
      : 0;

    const revenueTrailing12m = Math.round(
      result.reduce((sum, m) => sum + m.revenue, 0) * 100
    ) / 100;

    // Breakdown of active memberships this month by plan name
    const currentMonthBoundary = months[months.length - 1];
    const activeMembershipsNow = memberships.filter(mem => {
      if (!mem.start_date) return false;
      const start = new Date(mem.start_date);
      if (isNaN(start.getTime()) || start > currentMonthBoundary.end) return false;
      if (!mem.expiration_date) return true;
      const end = new Date(mem.expiration_date);
      return !isNaN(end.getTime()) && end >= currentMonthBoundary.start;
    });
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
      if (mem.status !== "active") continue;
      if (!mem.expiration_date) continue;
      if (mem.expiration_date < todayStr || mem.expiration_date > in30Str) continue;
      const existing = expiringByCustomer.get(mem.customer);
      if (!existing || mem.expiration_date > existing.expiration_date!) {
        expiringByCustomer.set(mem.customer, mem);
      }
    }

    const upcomingExpirations: Array<{ name: string; planName: string; expiresOn: string }> = [];
    for (const [customerId, mem] of expiringByCustomer.entries()) {
      const found = await db.select({ name: clientsTable.name })
        .from(clientsTable)
        .where(eq(clientsTable.teamupId, String(customerId)))
        .limit(1);
      upcomingExpirations.push({
        name: found[0]?.name ?? `Member #${customerId}`,
        planName: mem.name,
        expiresOn: mem.expiration_date!,
      });
    }
    upcomingExpirations.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
    logger.info({ count: upcomingExpirations.length }, "Reports: upcoming expirations");

    return res.json({
      months: result,
      current: {
        activeMembers: currentMonth?.activeMembers ?? 0,
        revenueTrailing12m,
        momChange,
      },
      membershipBreakdown,
      upcomingExpirations,
    });
  } catch (err) {
    logger.error({ err }, "Reports: membership report failed");
    return res.status(500).json({ error: (err as Error).message || "Failed to generate report" });
  }
});

export default router;
