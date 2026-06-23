import { Router } from "express";
import { processInBodyWebhook, type InBodyWebhookPayload } from "../services/inbody";
import { logger } from "../lib/logger";

const router = Router();

/**
 * POST /api/inbody/webhook
 *
 * InBody WebAPI pushes scan results here after each measurement.
 * Register this URL in the InBody WebAPI dashboard under "Webhook URL".
 *
 * INBODY_WEBHOOK_SECRET must be set. Add it as a custom header in the
 * InBody dashboard (e.g. Key1=X-Gym-Secret, Value1=<your secret>).
 * All requests without a matching secret are rejected with 401.
 */
router.post("/inbody/webhook", async (req, res) => {
  const secret = process.env.INBODY_WEBHOOK_SECRET;

  if (!secret) {
    logger.error("InBody webhook: INBODY_WEBHOOK_SECRET is not configured — rejecting request");
    return res.status(503).json({ error: "Webhook not configured" });
  }

  const provided = req.headers["x-gym-secret"] || req.headers["x-inbody-secret"];
  if (provided !== secret) {
    logger.warn({ ip: req.ip }, "InBody webhook: invalid secret");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const payload = req.body as InBodyWebhookPayload;

  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    const result = await processInBodyWebhook(payload);
    return res.json({ success: true, scansAdded: result.scansAdded });
  } catch (err) {
    logger.error({ err }, "InBody webhook processing error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
