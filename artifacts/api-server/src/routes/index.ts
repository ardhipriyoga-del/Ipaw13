import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trakcareRouter from "./trakcare";
import cloudRouter from "./cloud";
import aiAssistantRouter from "./aiAssistant";

const router: IRouter = Router();

router.use(healthRouter);
router.use(trakcareRouter);
router.use(cloudRouter);
router.use(aiAssistantRouter);

export default router;
