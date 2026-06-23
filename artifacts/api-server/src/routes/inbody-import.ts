import { Router } from "express";
import multer from "multer";
import { processInBodyWebhook, type InBodyWebhookPayload } from "../services/inbody";
import { logger } from "../lib/logger";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are accepted"));
    }
  },
});

/**
 * Parse a single CSV line, handling double-quoted fields that may contain commas.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Convert LookinBody date format "DD.MM.YYYY HH:MM:SS" → "YYYY-MM-DD".
 * Returns null if the value is missing or malformed.
 */
function parseDate(raw: string): string | null {
  if (!raw || raw === "-") return null;
  const datePart = raw.split(" ")[0];
  const parts = datePart.split(".");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy || yyyy.length !== 4) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseNum(raw: string): number | null {
  if (!raw || raw === "-") return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

/**
 * POST /api/inbody/import-csv
 *
 * Accepts a multipart/form-data upload with a single "file" field containing
 * the LookinBody CSV export. Each row is parsed and upserted via the existing
 * processInBodyWebhook logic.
 *
 * Returns: { imported: number, skipped: number, errors: string[] }
 */
router.post(
  "/inbody/import-csv",
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded. Send a CSV as form-data field 'file'." });
    }

    let csvText = req.file.buffer.toString("utf-8");

    // Strip UTF-8 BOM if present
    if (csvText.charCodeAt(0) === 0xfeff) {
      csvText = csvText.slice(1);
    }

    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lines.length < 2) {
      return res.status(400).json({ error: "CSV appears empty or has no data rows." });
    }

    // Skip header row (index 0)
    const dataRows = lines.slice(1);

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Column indices (0-based) confirmed from real LookinBody export
    const COL_NAME = 0;
    const COL_MOBILE = 6;
    const COL_EMAIL = 10;
    const COL_DATE = 13;
    const COL_WEIGHT = 14;
    const COL_TBW = 17;
    const COL_SMM = 32;
    const COL_BMI = 35;
    const COL_PBF = 38;
    const COL_BMR = 66;
    const COL_VFL = 70;

    for (let i = 0; i < dataRows.length; i++) {
      const rowNum = i + 2;
      const fields = parseCsvLine(dataRows[i]);

      try {
        const measurementDate = parseDate(fields[COL_DATE] ?? "");
        if (!measurementDate) {
          skipped++;
          continue;
        }

        const memberName = fields[COL_NAME] && fields[COL_NAME] !== "-" ? fields[COL_NAME] : null;
        const memberPhone = fields[COL_MOBILE] && fields[COL_MOBILE] !== "-" ? fields[COL_MOBILE] : null;
        const email = fields[COL_EMAIL] && fields[COL_EMAIL] !== "-" ? fields[COL_EMAIL].toLowerCase() : null;

        const payload: InBodyWebhookPayload = {
          MemberName: memberName ?? undefined,
          MemberID: memberPhone ?? undefined,
          email: email ?? undefined,
          MeasurementDate: measurementDate,
          Weight: parseNum(fields[COL_WEIGHT] ?? "") ?? undefined,
          TBW: parseNum(fields[COL_TBW] ?? "") ?? undefined,
          SMM: parseNum(fields[COL_SMM] ?? "") ?? undefined,
          BMI: parseNum(fields[COL_BMI] ?? "") ?? undefined,
          PBF: parseNum(fields[COL_PBF] ?? "") ?? undefined,
          BMR: parseNum(fields[COL_BMR] ?? "") ?? undefined,
          VFL: parseNum(fields[COL_VFL] ?? "") ?? undefined,
        };

        const result = await processInBodyWebhook(payload);
        if (result.scansAdded > 0) {
          imported++;
        } else {
          skipped++;
        }
      } catch (err) {
        const msg = `Row ${rowNum}: ${(err as Error).message ?? "Unknown error"}`;
        logger.warn({ err, rowNum }, "InBody CSV import row error");
        errors.push(msg);
      }
    }

    logger.info({ imported, skipped, errors: errors.length }, "InBody CSV import complete");
    return res.json({ imported, skipped, errors });
  }
);

export default router;
