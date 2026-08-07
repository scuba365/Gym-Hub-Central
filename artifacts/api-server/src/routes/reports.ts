import { Router } from "express";
import { GOTEAMUP_BASE, PAGE_SIZE, goteamupFetch, goteamupFetchAll } from "../lib/goteamup";
import { logger } from "../lib/logger";

const router = Router();

interface GoTeamUpMembership {
  id: number;
  customer: number;
  status: string;
  started_at: string | null;
  ended_at: string | null;
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

    // Compute per-month metrics (skip index 0, it's only used as "previous" for index 1)
    const result = months.slice(1).map((m, idx) => {
      const prevMonth = months[idx]; // one earlier

      // Active = membership overlaps this month
      const active = memberships.filter(mem => {
        if (!mem.started_at) return false;
        const start = new Date(mem.started_at);
        if (isNaN(start.getTime()) || start > m.end) return false;
        if (!mem.ended_at) return true;
        const end = new Date(mem.ended_at);
        return !isNaN(end.getTime()) && end >= m.start;
      });

      // Active at start of this month (= active during previous month) — for churn denominator
      const activeAtStartOfMonth = memberships.filter(mem => {
        if (!mem.started_at) return false;
        const start = new Date(mem.started_at);
        if (isNaN(start.getTime()) || start > prevMonth.end) return false;
        if (!mem.ended_at) return true;
        const end = new Date(mem.ended_at);
        return !isNaN(end.getTime()) && end >= prevMonth.start;
      });

      // New = started within this month
      const newMembers = memberships.filter(mem => {
        if (!mem.started_at) return false;
        const start = new Date(mem.started_at);
        return !isNaN(start.getTime()) && start >= m.start && start <= m.end;
      });

      // Churned = ended/expired within this month
      const churned = memberships.filter(mem => {
        if (!mem.ended_at) return false;
        if (!["expired", "cancelled", "ended"].includes(mem.status)) return false;
        const end = new Date(mem.ended_at);
        return !isNaN(end.getTime()) && end >= m.start && end <= m.end;
      });

      const denominator = activeAtStartOfMonth.length;
      const churnPct = denominator > 0
        ? Math.round((churned.length / denominator) * 1000) / 10
        : 0;

      return {
        month: m.key,
        activeMembers: active.length,
        newMembers: newMembers.length,
        churnedMembers: churned.length,
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

    return res.json({
      months: result,
      current: {
        activeMembers: currentMonth?.activeMembers ?? 0,
        revenueTrailing12m,
        momChange,
      },
    });
  } catch (err) {
    logger.error({ err }, "Reports: membership report failed");
    return res.status(500).json({ error: (err as Error).message || "Failed to generate report" });
  }
});

export default router;
