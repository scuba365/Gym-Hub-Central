import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable, inbodyScansTable } from "@workspace/db";
import { eq, isNotNull, and } from "drizzle-orm";
import { getAttendanceRiskByClientId } from "../services/attendance-risk";
import { GOTEAMUP_BASE, PAGE_SIZE, goteamupFetchAll } from "../lib/goteamup";
import { logger } from "../lib/logger";

const router = Router();

// ─── Membership breakdown cache ───────────────────────────────────────────────

interface ActiveMembership {
  customer: number;
  name: string;
  status: string;
}

export interface MembershipBreakdown {
  smallGroupPt: number;
  challenge: number;
  largeGroup: number;
  teen: number;
  flexPass: number;
  prime: number;
  other: number;
}

const PLAN_BUCKETS: Record<string, keyof MembershipBreakdown> = {
  "small group pt membership x2": "smallGroupPt",
  "small group pt membership x3": "smallGroupPt",
  "small group pt membership x4": "smallGroupPt",
  "level up": "smallGroupPt",
  "lifetime membership": "smallGroupPt",
  "couples membership": "smallGroupPt",
  "summer coaching": "smallGroupPt",
  "6 week challenge": "challenge",
  "30 day trial": "challenge",
  "athletic training club": "largeGroup",
  "next gen strength x1": "teen",
  "next gen strength": "teen",
  "atc starter pass": "flexPass",
  "flex pass 10": "flexPass",
  "prime strength": "prime",
};

let membershipBreakdownCache: { data: MembershipBreakdown; at: number } | null = null;
const MEMBERSHIP_CACHE_MS = 10 * 60 * 1000;

function bucketPlan(name: string): keyof MembershipBreakdown {
  return PLAN_BUCKETS[name.toLowerCase().trim()] ?? "other";
}

async function fetchMembershipBreakdown(token: string): Promise<MembershipBreakdown> {
  if (membershipBreakdownCache && Date.now() - membershipBreakdownCache.at < MEMBERSHIP_CACHE_MS) {
    return membershipBreakdownCache.data;
  }

  const memberships = await goteamupFetchAll<ActiveMembership>(
    `${GOTEAMUP_BASE}/customer_memberships?page_size=${PAGE_SIZE}&status=active`,
    token
  );

  // Deduplicate: if a customer has multiple active plans, count them in each relevant bucket
  const result: MembershipBreakdown = { smallGroupPt: 0, challenge: 0, largeGroup: 0, teen: 0, flexPass: 0, prime: 0, other: 0 };
  const counted = new Map<number, Set<keyof MembershipBreakdown>>();

  for (const mem of memberships) {
    const bucket = bucketPlan(mem.name ?? "");
    const seen = counted.get(mem.customer) ?? new Set();
    if (!seen.has(bucket)) {
      result[bucket]++;
      seen.add(bucket);
      counted.set(mem.customer, seen);
    }
  }

  logger.info(result, "Dashboard: membership breakdown fetched");
  membershipBreakdownCache = { data: result, at: Date.now() };
  return result;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/dashboard/stats", async (req, res) => {
  try {
    const clients = await db.select().from(clientsTable).where(eq(clientsTable.isMember, true));
    const attendanceRisk = await getAttendanceRiskByClientId(clients);

    const now = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split("T")[0];

    let totalClients = clients.length;
    let activeClients = 0;
    let atRiskClients = 0;
    let disengagedClients = 0;
    let needsMealPlanCount = 0;
    let overdueInBodyCount = 0;
    let attendanceSum = 0;
    let attendanceCount = 0;

    for (const c of clients) {
      if (c.engagementStatus === "active") activeClients++;
      else if (c.engagementStatus === "disengaged") disengagedClients++;

      if (attendanceRisk.get(c.id)?.needsCheckIn) atRiskClients++;

      if (c.needsMealPlan) needsMealPlanCount++;

      if (!c.latestScanDate || c.latestScanDate < ninetyDaysAgoStr) {
        overdueInBodyCount++;
      }

      if (c.weeklyAttendanceAvg != null) {
        attendanceSum += c.weeklyAttendanceAvg;
        attendanceCount++;
      }
    }

    const avgWeeklyAttendance = attendanceCount > 0
      ? Math.round((attendanceSum / attendanceCount) * 10) / 10
      : null;

    const lastSyncedAt =
      clients.length > 0
        ? clients
            .filter((c) => c.lastSyncedAt)
            .sort((a, b) => (b.lastSyncedAt || "").localeCompare(a.lastSyncedAt || ""))[0]
            ?.lastSyncedAt || null
        : null;

    const token = process.env.TEAMUP_M2M_TOKEN;
    let membershipBreakdown: MembershipBreakdown | null = null;
    if (token) {
      try {
        membershipBreakdown = await fetchMembershipBreakdown(token);
      } catch (err) {
        logger.warn({ err }, "Dashboard: membership breakdown fetch failed, omitting from stats");
      }
    }

    res.json({
      totalClients,
      activeClients,
      atRiskClients,
      disengagedClients,
      needsMealPlanCount,
      overdueInBodyCount,
      lastSyncedAt,
      avgWeeklyAttendance,
      membershipBreakdown,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

router.get("/dashboard/birthdays", async (req, res) => {
  try {
    const clients = await db
      .select()
      .from(clientsTable)
      .where(and(isNotNull(clientsTable.birthday), eq(clientsTable.isMember, true)));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 60);

    const upcoming: {
      id: number;
      name: string;
      birthday: string;
      birthdayThisYear: string;
      daysUntil: number;
      photoUrl: string | null;
    }[] = [];

    for (const c of clients) {
      if (!c.birthday) continue;
      const [, month, day] = c.birthday.split("-").map(Number);
      for (const yr of [today.getFullYear(), today.getFullYear() + 1]) {
        const bday = new Date(yr, month - 1, day);
        if (bday >= today && bday <= cutoff) {
          const daysUntil = Math.ceil((bday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          upcoming.push({
            id: c.id,
            name: c.name,
            birthday: c.birthday,
            birthdayThisYear: bday.toISOString().split("T")[0],
            daysUntil,
            photoUrl: c.photoUrl ?? null,
          });
          break;
        }
      }
    }

    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
    return res.json(upcoming);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch birthdays" });
  }
});

export default router;
