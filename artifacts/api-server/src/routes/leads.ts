import { Router } from "express";
import { db, leadsTable, clientsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { GOTEAMUP_BASE, PAGE_SIZE, goteamupFetch, goteamupFetchAll, type PaginatedResponse } from "../lib/goteamup";
import { logger } from "../lib/logger";
import {
  ListLeadsQueryParams,
  CreateLeadBody,
  GetLeadParams,
  UpdateLeadParams,
  UpdateLeadBody,
  DeleteLeadParams,
} from "@workspace/api-zod";

const router = Router();

function leadRow(lead: typeof leadsTable.$inferSelect) {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    status: lead.status,
    notes: lead.notes,
    goalText: lead.goalText,
    followUpAt: lead.followUpAt,
    externalId: lead.externalId,
    createdAt: lead.createdAt?.toISOString() ?? null,
    updatedAt: lead.updatedAt?.toISOString() ?? null,
  };
}

router.get("/leads", async (req, res) => {
  try {
    const parsed = ListLeadsQueryParams.safeParse(req.query);
    const params = parsed.success ? parsed.data : {};

    let query = db.select().from(leadsTable).$dynamic();
    if (params.status) {
      query = query.where(eq(leadsTable.status, params.status));
    }
    const leads = await query.orderBy(desc(leadsTable.createdAt));
    return res.json(leads.map(leadRow));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/leads", async (req, res) => {
  try {
    const parsed = CreateLeadBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const { name, email, phone, source, status, notes, goalText, followUpAt } = parsed.data;
    const [lead] = await db
      .insert(leadsTable)
      .values({
        name,
        email: email ?? null,
        phone: phone ?? null,
        source: source ?? "manual",
        status: status ?? "new",
        notes: notes ?? null,
        goalText: goalText ?? null,
        followUpAt: followUpAt ?? null,
      })
      .returning();
    return res.status(201).json(leadRow(lead));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/leads/:id", async (req, res) => {
  try {
    const parsed = GetLeadParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.id, parsed.data.id))
      .limit(1);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    return res.json(leadRow(lead));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/leads/:id", async (req, res) => {
  try {
    const paramsParsed = UpdateLeadParams.safeParse({ id: Number(req.params.id) });
    if (!paramsParsed.success) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const bodyParsed = UpdateLeadBody.safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({ error: bodyParsed.error.message });
    }
    const updates: Record<string, unknown> = { updatedAt: sql`now()` };
    const b = bodyParsed.data;
    if (b.name !== undefined) updates.name = b.name;
    if (b.email !== undefined) updates.email = b.email;
    if (b.phone !== undefined) updates.phone = b.phone;
    if (b.source !== undefined) updates.source = b.source;
    if (b.status !== undefined) updates.status = b.status;
    if (b.notes !== undefined) updates.notes = b.notes;
    if (b.goalText !== undefined) updates.goalText = b.goalText;
    if (b.followUpAt !== undefined) updates.followUpAt = b.followUpAt;

    const [lead] = await db
      .update(leadsTable)
      .set(updates)
      .where(eq(leadsTable.id, paramsParsed.data.id))
      .returning();
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    return res.json(leadRow(lead));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/leads/:id", async (req, res) => {
  try {
    const parsed = DeleteLeadParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const [deleted] = await db
      .delete(leadsTable)
      .where(eq(leadsTable.id, parsed.data.id))
      .returning({ id: leadsTable.id });
    if (!deleted) return res.status(404).json({ error: "Lead not found" });
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Promote lead → client ────────────────────────────────────────────────────

router.post("/leads/:id/promote", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id)).limit(1);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    // Check for duplicate email
    if (lead.email) {
      const [existing] = await db
        .select({ id: clientsTable.id })
        .from(clientsTable)
        .where(eq(clientsTable.email, lead.email))
        .limit(1);
      if (existing) return res.status(409).json({ error: "A client with this email already exists" });
    }

    const [client] = await db
      .insert(clientsTable)
      .values({
        name: lead.name,
        email: lead.email ?? null,
        phone: lead.phone ?? null,
        goals: lead.goalText ?? null,
        notes: lead.notes ?? null,
        isMember: true,
        needsMealPlan: false,
        engagementStatus: "unknown",
      })
      .returning({ id: clientsTable.id });

    logger.info({ leadId: id, clientId: client.id }, "Leads: promoted lead to client");
    return res.json({ clientId: client.id });
  } catch (err) {
    logger.error({ err }, "Leads: promote failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GoTeamUp trial import ────────────────────────────────────────────────────

const TRIAL_PLAN_NAMES = new Set([
  "30 day trial",
  "atc starter pass",
  "6 week challenge",
]);

interface GTUMembership {
  customer: number;
  name: string;
  status: string;
}

interface GTUCustomer {
  id: number;
  first_name: string;
  last_name: string;
  email?: string;
  phone_number?: string;
  mobile?: string;
}

router.post("/leads/sync/goteamup", async (req, res) => {
  const token = process.env.TEAMUP_M2M_TOKEN;
  if (!token) {
    return res.status(503).json({ error: "TEAMUP_M2M_TOKEN not configured" });
  }

  try {
    // Fetch all active memberships and collect customer IDs on trial plans
    const trialCustomerIds = new Set<number>();
    const memberships = await goteamupFetchAll<GTUMembership>(
      `${GOTEAMUP_BASE}/customer_memberships?page_size=${PAGE_SIZE}&status=active`,
      token
    );
    for (const m of memberships) {
      if (TRIAL_PLAN_NAMES.has((m.name ?? "").toLowerCase().trim())) {
        trialCustomerIds.add(m.customer);
      }
    }

    if (trialCustomerIds.size === 0) {
      return res.json({ created: 0, skipped: 0, errors: 0 });
    }

    // Fetch existing lead externalIds to skip duplicates
    const existingLeads = await db.select({ externalId: leadsTable.externalId }).from(leadsTable);
    const existingExternalIds = new Set(existingLeads.map((l) => l.externalId).filter(Boolean));

    // Fetch customer details
    let created = 0;
    let skipped = 0;
    let errors = 0;

    let nextUrl: string | null = `${GOTEAMUP_BASE}/customers?page_size=${PAGE_SIZE}&participating=true`;
    while (nextUrl) {
      const data = await goteamupFetch(nextUrl, token) as PaginatedResponse<GTUCustomer>;
      for (const c of data.results) {
        if (!trialCustomerIds.has(c.id)) continue;
        const externalId = `gtu_${c.id}`;
        if (existingExternalIds.has(externalId)) { skipped++; continue; }
        const name = `${c.first_name} ${c.last_name}`.trim();
        if (!name) { errors++; continue; }
        try {
          await db.insert(leadsTable).values({
            name,
            email: c.email ?? null,
            phone: c.phone_number ?? c.mobile ?? null,
            source: "goteamup",
            status: "new",
            externalId,
          });
          existingExternalIds.add(externalId);
          created++;
        } catch {
          errors++;
        }
      }
      nextUrl = data.next || null;
    }

    logger.info({ created, skipped, errors }, "Leads: GoTeamUp sync complete");
    return res.json({ created, skipped, errors });
  } catch (err) {
    logger.error({ err }, "Leads: GoTeamUp sync failed");
    return res.status(500).json({ error: "Sync failed" });
  }
});

export default router;
