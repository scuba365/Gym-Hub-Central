import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import syncRouter from "./sync";
import dashboardRouter from "./dashboard";
import inbodyWebhookRouter from "./inbody-webhook";
import inbodyImportRouter from "./inbody-import";
import aiRouter from "./ai";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(syncRouter);
router.use(dashboardRouter);
router.use(inbodyWebhookRouter);
router.use(inbodyImportRouter);
router.use(aiRouter);
router.use(reportsRouter);

export default router;
