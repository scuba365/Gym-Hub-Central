import { Router } from "express";
import { db, leadsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
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
    const { name, email, phone, source, status, notes, goalText } = parsed.data;
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

export default router;
