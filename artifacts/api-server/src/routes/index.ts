import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import syncRouter from "./sync";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(syncRouter);
router.use(dashboardRouter);

export default router;
