import { db } from "@workspace/db";
import { clientsTable, inbodyScansTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { logger } from "../lib/logger";

const LOOKINBODY_BASE = "https://apiusa.lookinbody.com";

/**
 * Strip all non-digit characters for consistent phone matching.
 * InBody sends MemberID as a phone number (digits only or with separators).
 * TeamUp stores phone in the same normalised form after its sync.
 */
function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

// ---------------------------------------------------------------------------
// LookinBody REST API types
// The LookinBody API identifies members by their phone number ("UserToken").
// Docs: https://apiusa.lookinbody.com  (requires approved API access)
// ---------------------------------------------------------------------------

interface LookinBodyResultItem {
  /** Measurement date — "YYYY-MM-DD" or "YYYY-MM-DDThh:mm:ss" */
  MeasurementDate?: string;
  Weight?: number;
  /** Percent Body Fat */
  PBF?: number;
  /** Skeletal Muscle Mass (kg) */
  SMM?: number;
  /** Basal Metabolic Rate (kcal) */
  BMR?: number;
  /** Visceral Fat Level */
  VFL?: number;
  BMI?: number;
  /** Total Body Water (kg) */
  TBW?: number;
  [key: string]: unknown;
}

interface LookinBodyResponse {
  /** "SUCCESS" on success */
  Status?: string;
  Message?: string;
  Results?: LookinBodyResultItem[];
}

/**
 * Fetch recent InBody measurements for a single member (identified by phone /
 * UserToken) from the LookinBody REST API.
 *
 * The API accepts an optional date range.  We request the last 90 days so we
 * don't miss scans from infrequent gym-goers, but avoid pulling the full
 * history on every sync.
 */
async function fetchLookinBodyScans(
  apiKey: string,
  accountName: string,
  userToken: string,
  sinceDays = 90
): Promise<LookinBodyResultItem[]> {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - sinceDays);
  const fromDate = sinceDate.toISOString().split("T")[0]; // "YYYY-MM-DD"

  const url = `${LOOKINBODY_BASE}/api/GetResult`;

  const body = {
    AccountName: accountName,
    APIKey: apiKey,
    UserToken: userToken,
    FromDate: fromDate,
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`LookinBody API error ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as LookinBodyResponse;

  if (data.Status && data.Status !== "SUCCESS") {
    // Non-success statuses (e.g. "NO_DATA") are not errors — just no scans
    logger.debug(
      { userToken, status: data.Status, message: data.Message },
      "LookinBody: non-success status (likely no data for member)"
    );
    return [];
  }

  return data.Results ?? [];
}

/**
 * Upsert a single InBody scan row for a known client.
 * Returns 1 if a new row was inserted, 0 if it already existed.
 */
async function upsertScan(
  clientId: number,
  item: LookinBodyResultItem
): Promise<number> {
  // Normalise the date to "YYYY-MM-DD"
  const rawDate = item.MeasurementDate ?? "";
  const measurementDate = rawDate.split("T")[0];
  if (!measurementDate) return 0;

  // Skip if this exact scan date already exists for this client
  const existing = await db
    .select({ id: inbodyScansTable.clientId })
    .from(inbodyScansTable)
    .where(eq(inbodyScansTable.clientId, clientId))
    .then((rows) => rows.find((r) => r.id === clientId));

  // More precise duplicate check by (clientId, scannedAt)
  const dupe = await db
    .select()
    .from(inbodyScansTable)
    .where(eq(inbodyScansTable.clientId, clientId))
    .then((rows) => rows.find((r) => r.scannedAt === measurementDate));

  if (dupe) return 0;

  const weightKg = typeof item.Weight === "number" ? item.Weight : null;
  const bodyFatPct = typeof item.PBF === "number" ? item.PBF : null;
  const muscleMassKg = typeof item.SMM === "number" ? item.SMM : null;
  const bmr = typeof item.BMR === "number" ? item.BMR : null;
  const visceralFatLevel = typeof item.VFL === "number" ? item.VFL : null;
  const bmi = typeof item.BMI === "number" ? item.BMI : null;
  const totalBodyWaterKg = typeof item.TBW === "number" ? item.TBW : null;

  await db.insert(inbodyScansTable).values({
    clientId,
    scannedAt: measurementDate,
    weightKg,
    bodyFatPct,
    muscleMassKg,
    bmr,
    visceralFatLevel,
    bmi,
    totalBodyWaterKg,
    rawJson: item,
  });

  // Update the client's latest scan snapshot if this is more recent
  const client = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .then((rows) => rows[0]);

  if (
    client &&
    (!client.latestScanDate || measurementDate > client.latestScanDate)
  ) {
    await db
      .update(clientsTable)
      .set({
        latestScanDate: measurementDate,
        latestWeight: weightKg,
        latestBodyFatPct: bodyFatPct,
        latestMuscleMass: muscleMassKg,
      })
      .where(eq(clientsTable.id, clientId));
  }

  return 1;
}

/**
 * Pull recent InBody scans for all clients that have a phone number from the
 * LookinBody API and persist any new measurements to the database.
 *
 * If LOOKINBODY_API_KEY / LOOKINBODY_ACCOUNT_NAME are not set the function is
 * a no-op (returns scansAdded: 0) so the sync route degrades gracefully.
 */
export async function syncInBody(): Promise<{ scansAdded: number }> {
  const apiKey = process.env.LOOKINBODY_API_KEY;
  const accountName = process.env.LOOKINBODY_ACCOUNT_NAME;

  if (!apiKey || !accountName) {
    logger.info(
      "LookinBody: LOOKINBODY_API_KEY / LOOKINBODY_ACCOUNT_NAME not set — skipping pull sync"
    );
    return { scansAdded: 0 };
  }

  // Fetch all clients that have a phone number (used as UserToken)
  const clients = await db
    .select()
    .from(clientsTable)
    .where(isNotNull(clientsTable.phone));

  logger.info(
    { clientCount: clients.length },
    "LookinBody: starting pull sync"
  );

  let scansAdded = 0;
  let errors = 0;

  for (const client of clients) {
    const phone = normalisePhone(client.phone);
    if (!phone) continue;

    try {
      const items = await fetchLookinBodyScans(apiKey, accountName, phone);

      for (const item of items) {
        scansAdded += await upsertScan(client.id, item);
      }
    } catch (err) {
      errors++;
      logger.warn(
        { clientId: client.id, phone, err },
        "LookinBody: failed to fetch scans for client"
      );
    }
  }

  logger.info(
    { scansAdded, errors, clientCount: clients.length },
    "LookinBody: pull sync complete"
  );

  return { scansAdded };
}

// ---------------------------------------------------------------------------
// Webhook path (kept for backward-compat — InBody devices can still push)
// ---------------------------------------------------------------------------

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
  const measurementDate =
    payload.MeasurementDate || new Date().toISOString().split("T")[0];

  // InBody uses phone numbers as MemberID — normalise for matching against the
  // phone column populated by the TeamUp sync.
  const memberPhone = memberId ? normalisePhone(memberId) : null;

  logger.info(
    { memberId, memberPhone, memberName, measurementDate },
    "Processing InBody webhook scan"
  );

  let client = null;

  // 1. Phone is the most reliable key
  if (!client && memberPhone) {
    const found = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.phone, memberPhone))
      .limit(1);
    client = found[0];
    if (client) {
      logger.info(
        { clientId: client.id, memberPhone },
        "InBody: matched client by phone number"
      );
    }
  }

  // 2. Stored InBody ID
  if (!client && memberId) {
    const found = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.inbodyId, memberId))
      .limit(1);
    client = found[0];
  }

  // 3. Email
  if (!client && email) {
    const found = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.email, email))
      .limit(1);
    client = found[0];
  }

  // 4. Name — last resort
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
      logger.warn(
        { payload },
        "InBody webhook: cannot create client — no name provided"
      );
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
    logger.info(
      { clientId: client.id, memberName },
      "InBody webhook: created new client"
    );
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

  const weightKg =
    typeof payload.Weight === "number" ? payload.Weight : null;
  const bodyFatPct =
    typeof payload.PBF === "number" ? payload.PBF : null;
  const muscleMassKg =
    typeof payload.SMM === "number" ? payload.SMM : null;
  const bmr = typeof payload.BMR === "number" ? payload.BMR : null;
  const visceralFatLevel =
    typeof payload.VFL === "number" ? payload.VFL : null;
  const bmi = typeof payload.BMI === "number" ? payload.BMI : null;
  const totalBodyWaterKg =
    typeof payload.TBW === "number" ? payload.TBW : null;

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

  logger.info(
    { clientId: client.id, measurementDate },
    "InBody scan saved via webhook"
  );
  return { scansAdded: 1 };
}
