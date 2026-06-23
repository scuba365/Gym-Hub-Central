import { db } from "@workspace/db";
import { clientsTable, inbodyScansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface InBodyWebhookPayload {
  EquipSerial?: string;
  MemberID?: string;
  MemberName?: string;
  email?: string;
  MeasurementDate?: string;
  Weight?: number;
  PBF?: number;
  SMM?: number;
  BMR?: number;
  VFL?: number;
  BMI?: number;
  TBW?: number;
  [key: string]: unknown;
}

export async function processInBodyWebhook(
  payload: InBodyWebhookPayload
): Promise<{ scansAdded: number }> {
  const memberName = payload.MemberName || null;
  const memberId = payload.MemberID || null;
  const email = payload.email?.toLowerCase() || null;
  const measurementDate = payload.MeasurementDate || new Date().toISOString().split("T")[0];

  logger.info({ memberId, memberName, measurementDate }, "Processing InBody webhook scan");

  let client = null;

  if (email) {
    const found = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.email, email))
      .limit(1);
    client = found[0];
  }

  if (!client && memberId) {
    const found = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.inbodyId, memberId))
      .limit(1);
    client = found[0];
  }

  if (!client && memberName) {
    const found = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.name, memberName))
      .limit(1);
    client = found[0];
  }

  if (!client) {
    if (!memberName) {
      logger.warn({ payload }, "InBody webhook: cannot create client — no name provided");
      return { scansAdded: 0 };
    }
    const [newClient] = await db
      .insert(clientsTable)
      .values({
        name: memberName,
        email: email || null,
        inbodyId: memberId || null,
      })
      .returning();
    client = newClient;
    logger.info({ clientId: client.id, memberName }, "InBody webhook: created new client");
  } else if (memberId && !client.inbodyId) {
    await db
      .update(clientsTable)
      .set({ inbodyId: memberId })
      .where(eq(clientsTable.id, client.id));
  }

  // Skip if this exact scan date already exists
  const existing = await db
    .select()
    .from(inbodyScansTable)
    .where(eq(inbodyScansTable.clientId, client.id))
    .then((rows) => rows.find((r) => r.scannedAt === measurementDate));

  if (existing) {
    return { scansAdded: 0 };
  }

  const weightKg = typeof payload.Weight === "number" ? payload.Weight : null;
  const bodyFatPct = typeof payload.PBF === "number" ? payload.PBF : null;
  const muscleMassKg = typeof payload.SMM === "number" ? payload.SMM : null;
  const bmr = typeof payload.BMR === "number" ? payload.BMR : null;
  const visceralFatLevel = typeof payload.VFL === "number" ? payload.VFL : null;
  const bmi = typeof payload.BMI === "number" ? payload.BMI : null;
  const totalBodyWaterKg = typeof payload.TBW === "number" ? payload.TBW : null;

  await db.insert(inbodyScansTable).values({
    clientId: client.id,
    scannedAt: measurementDate,
    weightKg,
    bodyFatPct,
    muscleMassKg,
    bmr,
    visceralFatLevel,
    bmi,
    totalBodyWaterKg,
    rawJson: payload,
  });

  await db
    .update(clientsTable)
    .set({
      latestScanDate: measurementDate,
      latestWeight: weightKg,
      latestBodyFatPct: bodyFatPct,
      latestMuscleMass: muscleMassKg,
    })
    .where(eq(clientsTable.id, client.id));

  logger.info({ clientId: client.id, measurementDate }, "InBody scan saved");
  return { scansAdded: 1 };
}

// No-op for the sync route — InBody is push-based (webhooks), not pull
export async function syncInBody(): Promise<{ scansAdded: number }> {
  logger.info("InBody: webhook-based — no pull sync needed");
  return { scansAdded: 0 };
}
