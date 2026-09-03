import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable, inbodyScansTable } from "@workspace/db";
import { eq, sql, count, isNotNull, and } from "drizzle-orm";
import { getAttendanceRiskByClientId } from "../services/attendance-risk";

const router = Router();

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

      // Overdue InBody: no scan in 90 days or never scanned
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

    // Get the last sync time
    const lastSyncedAt =
      clients.length > 0
        ? clients
            .filter((c) => c.lastSyncedAt)
            .sort((a, b) => (b.lastSyncedAt || "").localeCompare(a.lastSyncedAt || ""))[0]
            ?.lastSyncedAt || null
        : null;

    res.json({
      totalClients,
      activeClients,
      atRiskClients,
      disengagedClients,
      needsMealPlanCount,
      overdueInBodyCount,
      lastSyncedAt,
      avgWeeklyAttendance,
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
