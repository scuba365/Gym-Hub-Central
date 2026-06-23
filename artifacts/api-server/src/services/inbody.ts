import { db } from "@workspace/db";
import { clientsTable, inbodyScansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

interface InBodyScanResult {
  user_id: string;
  name: string;
  email?: string;
  measurement_date: string;
  weight: number;
  body_fat_percentage: number;
  skeletal_muscle_mass: number;
  bmr?: number;
  visceral_fat_level?: number;
  bmi?: number;
  total_body_water?: number;
  raw?: Record<string, unknown>;
}

async function inbodyRequest(path: string, apiKey: string, baseUrl: string): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`InBody API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<any>;
}

export async function syncInBody(): Promise<{ scansAdded: number }> {
  const apiKey = process.env.INBODY_API_KEY;
  const baseUrl = process.env.INBODY_BASE_URL || "https://onus.inbody.com/api/v1";

  if (!apiKey) {
    logger.warn("InBody credentials not configured (INBODY_API_KEY)");
    return { scansAdded: 0 };
  }

  let scansAdded = 0;

  try {
    // Fetch scan results from the past 180 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 180);

    const data = await inbodyRequest(
      `/measurements?from=${startDate.toISOString().split("T")[0]}&to=${endDate.toISOString().split("T")[0]}`,
      apiKey,
      baseUrl
    );

    const scans: InBodyScanResult[] = data.measurements || data.results || data || [];

    for (const scan of scans) {
      const email = scan.email?.toLowerCase();
      const name = scan.name;

      // Find client by email or name
      let client = null;
      if (email) {
        const found = await db
          .select()
          .from(clientsTable)
          .where(eq(clientsTable.email, email))
          .limit(1);
        client = found[0];
      }

      if (!client && scan.user_id) {
        const found = await db
          .select()
          .from(clientsTable)
          .where(eq(clientsTable.inbodyId, scan.user_id))
          .limit(1);
        client = found[0];
      }

      if (!client && name) {
        const found = await db
          .select()
          .from(clientsTable)
          .where(eq(clientsTable.name, name))
          .limit(1);
        client = found[0];
      }

      if (!client) {
        // Create client from InBody data
        const [newClient] = await db
          .insert(clientsTable)
          .values({
            name: name || "Unknown",
            email: email || null,
            inbodyId: scan.user_id || null,
          })
          .returning();
        client = newClient;
      } else if (scan.user_id && !client.inbodyId) {
        await db
          .update(clientsTable)
          .set({ inbodyId: scan.user_id })
          .where(eq(clientsTable.id, client.id));
      }

      // Insert scan (skip duplicates based on clientId + scannedAt)
      const scanDate = scan.measurement_date;
      const existing = await db
        .select()
        .from(inbodyScansTable)
        .where(eq(inbodyScansTable.clientId, client.id))
        .then((rows) => rows.find((r) => r.scannedAt === scanDate));

      if (!existing) {
        await db.insert(inbodyScansTable).values({
          clientId: client.id,
          scannedAt: scanDate,
          weightKg: scan.weight ?? null,
          bodyFatPct: scan.body_fat_percentage ?? null,
          muscleMassKg: scan.skeletal_muscle_mass ?? null,
          bmr: scan.bmr ?? null,
          visceralFatLevel: scan.visceral_fat_level ?? null,
          bmi: scan.bmi ?? null,
          totalBodyWaterKg: scan.total_body_water ?? null,
          rawJson: scan.raw ?? null,
        });
        scansAdded++;

        // Update client's latest scan data
        await db
          .update(clientsTable)
          .set({
            latestScanDate: scanDate,
            latestWeight: scan.weight ?? null,
            latestBodyFatPct: scan.body_fat_percentage ?? null,
            latestMuscleMass: scan.skeletal_muscle_mass ?? null,
          })
          .where(eq(clientsTable.id, client.id));
      }
    }

    // For each client, ensure latest scan fields reflect their most recent scan
    await refreshLatestScanData();
  } catch (err) {
    logger.error({ err }, "InBody sync error");
  }

  return { scansAdded };
}

async function refreshLatestScanData() {
  const clients = await db.select().from(clientsTable);

  for (const client of clients) {
    const scans = await db
      .select()
      .from(inbodyScansTable)
      .where(eq(inbodyScansTable.clientId, client.id));

    if (scans.length === 0) continue;

    const latestScan = scans.sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))[0];

    await db
      .update(clientsTable)
      .set({
        latestScanDate: latestScan.scannedAt,
        latestWeight: latestScan.weightKg,
        latestBodyFatPct: latestScan.bodyFatPct,
        latestMuscleMass: latestScan.muscleMassKg,
      })
      .where(eq(clientsTable.id, client.id));
  }
}
