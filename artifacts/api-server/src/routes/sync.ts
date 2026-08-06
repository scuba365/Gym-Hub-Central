import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db";
import { syncTeamup } from "../services/teamup";
import { syncTrainerize } from "../services/trainerize";
import { syncInBody } from "../services/inbody";
import { logger } from "../lib/logger";

// Centralized, deterministic engagement computation.
// Called after all sync sources have finished writing their source-specific fields
// (lastAttendanceDate from TeamUp, lastTrainingDate from Trainerize).
// OR semantics: a client is disengaged if EITHER attendance OR training signals disengagement.
async function computeAllEngagementStatuses(): Promise<void> {
  const clients = await db.select().from(clientsTable);
  const now = new Date();

  const engagementRank = (days: number | null): number => {
    if (days === null) return 0;
    if (days <= 7) return 1;
    if (days <= 14) return 2;
    return 3;
  };

  const engagementLabel = (rank: number): string => {
    if (rank === 3) return "disengaged";
    if (rank === 2) return "at_risk";
    if (rank === 1) return "active";
    return "unknown";
  };

  for (const client of clients) {
    const attendanceDays = client.lastAttendanceDate
      ? Math.floor((now.getTime() - new Date(client.lastAttendanceDate).getTime()) / 86400000)
      : null;
    const trainingDays = client.lastTrainingDate
      ? Math.floor((now.getTime() - new Date(client.lastTrainingDate).getTime()) / 86400000)
      : null;

    const worstRank = Math.max(engagementRank(attendanceDays), engagementRank(trainingDays));
    const engagementStatus = engagementLabel(worstRank);

    await db
      .update(clientsTable)
      .set({ engagementStatus })
      .where(eq(clientsTable.id, client.id));
  }
}

const router = Router();

router.post("/sync", async (req, res) => {
  const startTime = Date.now();

  const configuredSources: string[] = [];
  const missingSources: string[] = [];

  if (process.env.TEAMUP_M2M_TOKEN) {
    configuredSources.push("TeamUp");
  } else {
    missingSources.push("TeamUp");
  }

  if (process.env.TRAINERIZE_TOKEN && process.env.TRAINERIZE_GROUP_ID) {
    configuredSources.push("Trainerize");
  } else {
    missingSources.push("Trainerize");
  }

  // LookinBody pull sync — fetches scans for all clients with a phone number.
  // Webhook path (INBODY_WEBHOOK_SECRET) also remains active as a fallback.
  if (process.env.LOOKINBODY_API_KEY && process.env.LOOKINBODY_ACCOUNT_NAME) {
    configuredSources.push("LookinBody (pull)");
  } else {
    missingSources.push(
      "LookinBody (pull — set LOOKINBODY_API_KEY and LOOKINBODY_ACCOUNT_NAME)"
    );
  }
  if (process.env.INBODY_WEBHOOK_SECRET) {
    configuredSources.push("InBody (webhook)");
  }

  const errors: string[] = [];

  try {
    const [teamupResult, trainerizeResult, inbodyResult] = await Promise.allSettled([
      syncTeamup(),
      syncTrainerize(),
      syncInBody(),
    ]);

    let clientsUpdated = 0;
    let attendanceRecordsAdded = 0;
    let trainingSessionsAdded = 0;
    let scansAdded = 0;

    if (teamupResult.status === "fulfilled") {
      clientsUpdated += teamupResult.value.clientsUpdated;
      attendanceRecordsAdded += teamupResult.value.attendanceAdded;
    } else {
      errors.push(`TeamUp: ${teamupResult.reason?.message || "Unknown error"}`);
    }

    if (trainerizeResult.status === "fulfilled") {
      clientsUpdated += trainerizeResult.value.clientsUpdated;
      trainingSessionsAdded += trainerizeResult.value.sessionsAdded;
    } else {
      errors.push(`Trainerize: ${trainerizeResult.reason?.message || "Unknown error"}`);
    }

    if (inbodyResult.status === "fulfilled") {
      scansAdded += inbodyResult.value.scansAdded;
    } else {
      errors.push(`InBody: ${inbodyResult.reason?.message || "Unknown error"}`);
    }

    // Compute engagement status from merged source data after all writes complete.
    await computeAllEngagementStatuses();

    const elapsed = Date.now() - startTime;
    logger.info({ elapsed, clientsUpdated, attendanceRecordsAdded, trainingSessionsAdded, scansAdded }, "Sync complete");

    return res.json({
      success: errors.length === 0,
      clientsUpdated,
      attendanceRecordsAdded,
      trainingSessionsAdded,
      scansAdded,
      syncedAt: new Date().toISOString(),
      errors,
      configuredSources,
      missingSources,
    });
  } catch (err) {
    logger.error({ err }, "Sync failed");
    return res.status(500).json({
      success: false,
      clientsUpdated: 0,
      attendanceRecordsAdded: 0,
      trainingSessionsAdded: 0,
      scansAdded: 0,
      syncedAt: new Date().toISOString(),
      errors: [(err as Error).message || "Unexpected error"],
      configuredSources,
      missingSources,
    });
  }
});

export default router;
