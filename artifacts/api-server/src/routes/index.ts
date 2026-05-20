import { Router, type IRouter } from "express";
import healthRouter from "./health";
import captionsRouter from "./captions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(captionsRouter);

export default router;
