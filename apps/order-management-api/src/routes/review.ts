import { Router } from "express";
import { submitReviewDecision } from "../controllers/review.js";

const router = Router();

router.post("/:id/review", submitReviewDecision);

export default router;
