import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable, inbodyScansTable, attendanceRecordsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  ListClientsQueryParams,
  UpdateClientBody,
  GetClientParams,
  GetClientScansParams,
  GetClientAttendanceParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/clients", async (req, res) => {
  try {
    const parsed = ListClientsQueryParams.safeParse(req.query);
    const params = parsed.success ? parsed.data : {};

    let query = db.select().from(clientsTable).$dynamic();

    const conditions = [];

    if (params.search) {
      conditions.push(
        sql`(${clientsTable.name} ILIKE ${"%" + params.search + "%"} OR ${clientsTable.email} ILIKE ${"%" + params.search + "%"})`
      );
    }

    if (params.engagementStatus) {
      conditions.push(eq(clientsTable.engagementStatus, params.engagementStatus));
    }

    if (params.needsMealPlan !== undefined) {
      conditions.push(eq(clientsTable.needsMealPlan, params.needsMealPlan));
    }

    if (params.isMember !== undefined) {
      conditions.push(eq(clientsTable.isMember, params.isMember));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const clients = await query;

    return res.json(
      clients.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        photoUrl: c.photoUrl,
        goals: c.goals,
        needsMealPlan: c.needsMealPlan,
        isMember: c.isMember,
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
      }))
    );
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch clients" });
  }
});

router.get("/clients/:id", async (req, res) => {
  try {
    const parsed = GetClientParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const [client] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, parsed.data.id))
      .limit(1);

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const recentScans = await db
      .select()
      .from(inbodyScansTable)
      .where(eq(inbodyScansTable.clientId, client.id));

    const recentAttendance = await db
      .select()
      .from(attendanceRecordsTable)
      .where(eq(attendanceRecordsTable.clientId, client.id));

    const sortedScans = recentScans
      .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))
      .slice(0, 24)
      .map((s) => ({
        id: s.id,
        clientId: s.clientId,
        scannedAt: s.scannedAt,
        weightKg: s.weightKg,
        bodyFatPct: s.bodyFatPct,
        muscleMassKg: s.muscleMassKg,
        bmr: s.bmr,
        visceralFatLevel: s.visceralFatLevel,
        bmi: s.bmi,
        totalBodyWaterKg: s.totalBodyWaterKg,
      }));

    const sortedAttendance = recentAttendance
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 90)
      .map((a) => ({
        id: a.id,
        clientId: a.clientId,
        date: a.date,
        className: a.className,
      }));

    return res.json({
      id: client.id,
      name: client.name,
      email: client.email,
      photoUrl: client.photoUrl,
      goals: client.goals,
      needsMealPlan: client.needsMealPlan,
      isMember: client.isMember,
      notes: client.notes,
      engagementStatus: client.engagementStatus,
      weeklyAttendanceAvg: client.weeklyAttendanceAvg,
      lastAttendanceDate: client.lastAttendanceDate,
      lastTrainingDate: client.lastTrainingDate,
      workoutCompliancePct: client.workoutCompliancePct,
      latestScanDate: client.latestScanDate,
      latestWeight: client.latestWeight,
      latestBodyFatPct: client.latestBodyFatPct,
      latestMuscleMass: client.latestMuscleMass,
      lastSyncedAt: client.lastSyncedAt,
      teamupId: client.teamupId,
      trainerizeId: client.trainerizeId,
      inbodyId: client.inbodyId,
      dailyCalorieTarget: client.dailyCalorieTarget,
      proteinTargetG: client.proteinTargetG,
      carbsTargetG: client.carbsTargetG,
      fatTargetG: client.fatTargetG,
      macroTargetsUpdatedAt: client.macroTargetsUpdatedAt,
      macroTargetsRationale: client.macroTargetsRationale,
      lastAiInsight: client.lastAiInsight,
      lastAiInsightAt: client.lastAiInsightAt,
      recentScans: sortedScans,
      recentAttendance: sortedAttendance,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch client" });
  }
});

router.put("/clients/:id", async (req, res) => {
  try {
    const parsed = GetClientParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const bodyParsed = UpdateClientBody.safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const update: Record<string, unknown> = {};
    if (bodyParsed.data.goals !== undefined) update.goals = bodyParsed.data.goals;
    if (bodyParsed.data.needsMealPlan !== undefined) update.needsMealPlan = bodyParsed.data.needsMealPlan;
    if (bodyParsed.data.notes !== undefined) update.notes = bodyParsed.data.notes;

    const [updated] = await db
      .update(clientsTable)
      .set(update)
      .where(eq(clientsTable.id, parsed.data.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Client not found" });
    }

    return res.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      photoUrl: updated.photoUrl,
      goals: updated.goals,
      needsMealPlan: updated.needsMealPlan,
      isMember: updated.isMember,
      notes: updated.notes,
      engagementStatus: updated.engagementStatus,
      weeklyAttendanceAvg: updated.weeklyAttendanceAvg,
      lastAttendanceDate: updated.lastAttendanceDate,
      lastTrainingDate: updated.lastTrainingDate,
      workoutCompliancePct: updated.workoutCompliancePct,
      latestScanDate: updated.latestScanDate,
      latestWeight: updated.latestWeight,
      latestBodyFatPct: updated.latestBodyFatPct,
      latestMuscleMass: updated.latestMuscleMass,
      lastSyncedAt: updated.lastSyncedAt,
      teamupId: updated.teamupId,
      trainerizeId: updated.trainerizeId,
      inbodyId: updated.inbodyId,
      dailyCalorieTarget: updated.dailyCalorieTarget,
      proteinTargetG: updated.proteinTargetG,
      carbsTargetG: updated.carbsTargetG,
      fatTargetG: updated.fatTargetG,
      macroTargetsUpdatedAt: updated.macroTargetsUpdatedAt,
      macroTargetsRationale: updated.macroTargetsRationale,
      lastAiInsight: updated.lastAiInsight,
      lastAiInsightAt: updated.lastAiInsightAt,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update client" });
  }
});

router.delete("/clients/:id", async (req, res) => {
  try {
    const parsed = GetClientParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const [deleted] = await db
      .delete(clientsTable)
      .where(eq(clientsTable.id, parsed.data.id))
      .returning({ id: clientsTable.id });

    if (!deleted) {
      return res.status(404).json({ error: "Client not found" });
    }

    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete client" });
  }
});

router.get("/clients/:id/scans", async (req, res) => {
  try {
    const parsed = GetClientScansParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const scans = await db
      .select()
      .from(inbodyScansTable)
      .where(eq(inbodyScansTable.clientId, parsed.data.id));

    return res.json(
      scans
        .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))
        .map((s) => ({
          id: s.id,
          clientId: s.clientId,
          scannedAt: s.scannedAt,
          weightKg: s.weightKg,
          bodyFatPct: s.bodyFatPct,
          muscleMassKg: s.muscleMassKg,
          bmr: s.bmr,
          visceralFatLevel: s.visceralFatLevel,
          bmi: s.bmi,
          totalBodyWaterKg: s.totalBodyWaterKg,
        }))
    );
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch scans" });
  }
});

router.get("/clients/:id/attendance", async (req, res) => {
  try {
    const parsed = GetClientAttendanceParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const records = await db
      .select()
      .from(attendanceRecordsTable)
      .where(eq(attendanceRecordsTable.clientId, parsed.data.id));

    return res.json(
      records
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((r) => ({
          id: r.id,
          clientId: r.clientId,
          date: r.date,
          className: r.className,
        }))
    );
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch attendance" });
  }
});

export default router;
