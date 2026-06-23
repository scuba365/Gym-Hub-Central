import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable, inbodyScansTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (req, res) => {
  try {
    const clients = await db.select().from(clientsTable);

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

    for (const c of clients) {
      if (c.engagementStatus === "active") activeClients++;
      else if (c.engagementStatus === "at_risk") atRiskClients++;
      else if (c.engagementStatus === "disengaged") disengagedClients++;

      if (c.needsMealPlan) needsMealPlanCount++;

      // Overdue InBody: no scan in 90 days or never scanned
      if (!c.latestScanDate || c.latestScanDate < ninetyDaysAgoStr) {
        overdueInBodyCount++;
      }
    }

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
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

export default router;
