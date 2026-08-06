import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  clientsTable,
  inbodyScansTable,
  attendanceRecordsTable,
  checkinDraftsTable,
} from "@workspace/db";
import { generateClientInsight, generateCheckinDraft, generateMacroTargets } from "../services/ai";
import { logger } from "../lib/logger";

const router = Router();

function aiUnavailable(): boolean {
  return !process.env.ANTHROPIC_API_KEY;
}

function clientSummaryFields(c: typeof clientsTable.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    photoUrl: c.photoUrl,
    goals: c.goals,
    needsMealPlan: c.needsMealPlan,
    notes: c.notes,
    engagementStatus: c.engagementStatus,
    weeklyAttendanceAvg: c.weeklyAttendanceAvg,
    lastAttendanceDate: c.lastAttendanceDate,
    lastTrainingDate: c.lastTrainingDate,
    workoutCompliancePct: c.workoutCompliancePct,
    latestScanDate: c.latestScanDate,
    latestWeight: c.latestWeight,
    latestBodyFatPct: c.latestBodyFatPct,
    latestMuscleMass: c.latestMuscleMass,
    lastSyncedAt: c.lastSyncedAt,
    teamupId: c.teamupId,
    trainerizeId: c.trainerizeId,
    inbodyId: c.inbodyId,
    dailyCalorieTarget: c.dailyCalorieTarget,
    proteinTargetG: c.proteinTargetG,
    carbsTargetG: c.carbsTargetG,
    fatTargetG: c.fatTargetG,
    macroTargetsUpdatedAt: c.macroTargetsUpdatedAt,
    macroTargetsRationale: c.macroTargetsRationale,
    lastAiInsight: c.lastAiInsight,
    lastAiInsightAt: c.lastAiInsightAt,
  };
}

// POST /clients/:id/ai/insight
router.post("/clients/:id/ai/insight", async (req, res) => {
  if (aiUnavailable()) {
    return res.status(400).json({ error: "AI features require ANTHROPIC_API_KEY to be set" });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id)).limit(1);
  if (!client) return res.status(404).json({ error: "Client not found" });

  const [attendance, scans] = await Promise.all([
    db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.clientId, id)),
    db.select().from(inbodyScansTable).where(eq(inbodyScansTable.clientId, id)),
  ]);

  try {
    const insight = await generateClientInsight(client, attendance, scans);
    const generatedAt = new Date().toISOString();

    await db
      .update(clientsTable)
      .set({ lastAiInsight: insight, lastAiInsightAt: generatedAt })
      .where(eq(clientsTable.id, id));

    return res.json({ insight, generatedAt });
  } catch (err) {
    logger.error({ err }, "Failed to generate client insight");
    return res.status(500).json({ error: (err as Error).message || "Failed to generate insight" });
  }
});

// POST /clients/:id/ai/checkin
router.post("/clients/:id/ai/checkin", async (req, res) => {
  if (aiUnavailable()) {
    return res.status(400).json({ error: "AI features require ANTHROPIC_API_KEY to be set" });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id)).limit(1);
  if (!client) return res.status(404).json({ error: "Client not found" });

  const [attendance, scans] = await Promise.all([
    db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.clientId, id)),
    db.select().from(inbodyScansTable).where(eq(inbodyScansTable.clientId, id)),
  ]);

  try {
    const draftText = await generateCheckinDraft(client, attendance, scans);

    const [draft] = await db
      .insert(checkinDraftsTable)
      .values({ clientId: id, draftText, status: "draft" })
      .returning();

    return res.json({
      id: draft.id,
      clientId: draft.clientId,
      draftText: draft.draftText,
      status: draft.status,
      createdAt: draft.createdAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to generate checkin draft");
    return res.status(500).json({ error: (err as Error).message || "Failed to generate check-in draft" });
  }
});

// GET /clients/:id/ai/checkins
router.get("/clients/:id/ai/checkins", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id)).limit(1);
  if (!client) return res.status(404).json({ error: "Client not found" });

  const drafts = await db
    .select()
    .from(checkinDraftsTable)
    .where(eq(checkinDraftsTable.clientId, id))
    .orderBy(desc(checkinDraftsTable.createdAt))
    .limit(20);

  return res.json(
    drafts.map(d => ({
      id: d.id,
      clientId: d.clientId,
      draftText: d.draftText,
      status: d.status,
      createdAt: d.createdAt?.toISOString() ?? null,
    }))
  );
});

// PATCH /clients/:id/ai/checkins/:draftId
router.patch("/clients/:id/ai/checkins/:draftId", async (req, res) => {
  const id = Number(req.params.id);
  const draftId = Number(req.params.draftId);

  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(draftId) || draftId <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const { status } = req.body as { status?: string };
  if (!status || !["draft", "sent", "dismissed"].includes(status)) {
    return res.status(400).json({ error: "status must be one of: draft, sent, dismissed" });
  }

  const [draft] = await db
    .update(checkinDraftsTable)
    .set({ status })
    .where(eq(checkinDraftsTable.id, draftId))
    .returning();

  if (!draft) return res.status(404).json({ error: "Draft not found" });

  return res.json({
    id: draft.id,
    clientId: draft.clientId,
    draftText: draft.draftText,
    status: draft.status,
    createdAt: draft.createdAt?.toISOString() ?? null,
  });
});

// POST /clients/:id/ai/macros
router.post("/clients/:id/ai/macros", async (req, res) => {
  if (aiUnavailable()) {
    return res.status(400).json({ error: "AI features require ANTHROPIC_API_KEY to be set" });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id)).limit(1);
  if (!client) return res.status(404).json({ error: "Client not found" });

  const scans = await db
    .select()
    .from(inbodyScansTable)
    .where(eq(inbodyScansTable.clientId, id))
    .orderBy(desc(inbodyScansTable.scannedAt))
    .limit(1);

  if (!scans.length) {
    return res.status(400).json({ error: "Client needs at least one InBody scan to generate macro targets" });
  }

  try {
    const macros = await generateMacroTargets(client, scans[0]);
    const now = new Date().toISOString();

    const [updated] = await db
      .update(clientsTable)
      .set({
        dailyCalorieTarget: macros.calories,
        proteinTargetG: macros.proteinG,
        carbsTargetG: macros.carbsG,
        fatTargetG: macros.fatG,
        macroTargetsUpdatedAt: now,
        macroTargetsRationale: macros.rationale,
      })
      .where(eq(clientsTable.id, id))
      .returning();

    return res.json(clientSummaryFields(updated));
  } catch (err) {
    logger.error({ err }, "Failed to generate macro targets");
    return res.status(500).json({ error: (err as Error).message || "Failed to generate macro targets" });
  }
});

// PATCH /clients/:id/macros
router.patch("/clients/:id/macros", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const body = req.body as {
    dailyCalorieTarget?: number | null;
    proteinTargetG?: number | null;
    carbsTargetG?: number | null;
    fatTargetG?: number | null;
  };

  const update: Record<string, unknown> = {};
  if (body.dailyCalorieTarget !== undefined) update.dailyCalorieTarget = body.dailyCalorieTarget;
  if (body.proteinTargetG !== undefined) update.proteinTargetG = body.proteinTargetG;
  if (body.carbsTargetG !== undefined) update.carbsTargetG = body.carbsTargetG;
  if (body.fatTargetG !== undefined) update.fatTargetG = body.fatTargetG;

  const [updated] = await db
    .update(clientsTable)
    .set(update)
    .where(eq(clientsTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Client not found" });

  return res.json(clientSummaryFields(updated));
});

export default router;
