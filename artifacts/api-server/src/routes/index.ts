import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trakcareRouter from "./trakcare";
import cloudRouter from "./cloud";

const router: IRouter = Router();

router.use(healthRouter);
router.use(trakcareRouter);
router.use(cloudRouter);

export default router;
