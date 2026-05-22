import { Router, type IRouter } from "express";
import healthRouter from "./health";
import captionsRouter from "./captions";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(captionsRouter);

export default router;
