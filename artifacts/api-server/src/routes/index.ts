import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import syncRouter from "./sync";
import dashboardRouter from "./dashboard";
import inbodyWebhookRouter from "./inbody-webhook";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(syncRouter);
router.use(dashboardRouter);
router.use(inbodyWebhookRouter);

export default router;
