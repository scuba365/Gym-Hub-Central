import { db } from "@workspace/db";
import { clientsTable, trainingSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const TRAINERIZE_BASE_URL = "https://api.trainerize.com/v03";

interface TrainerizeClient {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  profileIconUrl?: string;
  latestSignedIn?: string | null;
  status: string;
  trialStatus: string;
}

function getBasicAuth(): string {
  const groupId = process.env.TRAINERIZE_GROUP_ID;
  const token = process.env.TRAINERIZE_TOKEN;
  if (!groupId || !token) throw new Error("Trainerize credentials missing");
  return Buffer.from(`${groupId}:${token}`).toString("base64");
}

async function trainerizePost(path: string, body: Record<string, unknown>): Promise<any> {
  const auth = getBasicAuth();
  const response = await fetch(`${TRAINERIZE_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Trainerize API error ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

export async function syncTrainerize(): Promise<{ clientsUpdated: number; sessionsAdded: number }> {
  const groupId = process.env.TRAINERIZE_GROUP_ID;
  const token = process.env.TRAINERIZE_TOKEN;

  if (!groupId || !token) {
    logger.warn("Trainerize credentials not configured (TRAINERIZE_GROUP_ID, TRAINERIZE_TOKEN)");
    return { clientsUpdated: 0, sessionsAdded: 0 };
  }

  let clientsUpdated = 0;
  let sessionsAdded = 0;

  try {
    // Fetch all clients in batches of 50
    const allClients: TrainerizeClient[] = [];
    let start = 0;
    const count = 50;

    while (true) {
      const data = await trainerizePost("/user/getClientList", { start, count });
      const batch: TrainerizeClient[] = data.users || [];
      allClients.push(...batch);
      if (batch.length < count) break;
      start += count;
    }

    logger.info({ count: allClients.length }, "Trainerize: clients fetched");

    for (const tc of allClients) {
      // Skip inactive/deleted clients
      if (tc.status !== "active") continue;

      const name = `${tc.firstName} ${tc.lastName}`.trim();
      const email = tc.email?.toLowerCase() || null;
      const trainerizeId = String(tc.id);

      let client = null;

      if (email) {
        const found = await db.select().from(clientsTable).where(eq(clientsTable.email, email)).limit(1);
        client = found[0];
      }

      if (!client) {
        const found = await db.select().from(clientsTable).where(eq(clientsTable.trainerizeId, trainerizeId)).limit(1);
        client = found[0];
      }

      if (!client) {
        const [newClient] = await db
          .insert(clientsTable)
          .values({
            name,
            email,
            photoUrl: tc.profileIconUrl || null,
            trainerizeId,
          })
          .returning();
        client = newClient;
        clientsUpdated++;
      } else {
        await db.update(clientsTable).set({
          trainerizeId,
          photoUrl: tc.profileIconUrl || client.photoUrl,
        }).where(eq(clientsTable.id, client.id));
      }

      // Use latestSignedIn as a proxy for last training activity
      // and record it as a training session if not already present
      if (tc.latestSignedIn) {
        const lastDate = tc.latestSignedIn.split(" ")[0]; // "2026-06-22 18:05:02" → "2026-06-22"
        const externalId = `trainerize-signin-${tc.id}-${lastDate}`;

        const existing = await db
          .select()
          .from(trainingSessionsTable)
          .where(eq(trainingSessionsTable.externalId, externalId))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(trainingSessionsTable).values({
            clientId: client.id,
            date: lastDate,
            workoutName: "App Activity",
            completed: true,
            externalId,
          });
          sessionsAdded++;
        }

        // Update last training date
        await db.update(clientsTable).set({
          lastTrainingDate: lastDate,
        }).where(eq(clientsTable.id, client.id));
      }
    }
  } catch (err) {
    logger.error({ err }, "Trainerize sync error");
    throw err;
  }

  return { clientsUpdated, sessionsAdded };
}
