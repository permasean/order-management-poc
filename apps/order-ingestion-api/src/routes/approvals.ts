import { Router } from "express";
import { approveOrder } from "../controllers/approvals.js";

const router = Router();

router.post("/", approveOrder);

export default router;
