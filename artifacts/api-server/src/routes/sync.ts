import { Router } from "express";
import { syncTeamup } from "../services/teamup";
import { syncTrainerize } from "../services/trainerize";
import { syncInBody } from "../services/inbody";
import { logger } from "../lib/logger";

const router = Router();

router.post("/sync", async (req, res) => {
  const startTime = Date.now();

  const configuredSources: string[] = [];
  const missingSources: string[] = [];

  if (process.env.TEAMUP_API_KEY && process.env.TEAMUP_CALENDAR_KEY) {
    configuredSources.push("TeamUp");
  } else {
    missingSources.push("TeamUp");
  }

  if (process.env.TRAINERIZE_API_KEY && process.env.TRAINERIZE_ACCOUNT_ID) {
    configuredSources.push("Trainerize");
  } else {
    missingSources.push("Trainerize");
  }

  if (process.env.INBODY_API_KEY) {
    configuredSources.push("InBody");
  } else {
    missingSources.push("InBody");
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

    const elapsed = Date.now() - startTime;
    logger.info({ elapsed, clientsUpdated, attendanceRecordsAdded, trainingSessionsAdded, scansAdded }, "Sync complete");

    res.json({
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
    res.status(500).json({
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
