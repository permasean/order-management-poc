import { Router } from "express";
import { createOrder } from "../controllers/orders.js";

const router = Router();

router.post("/", createOrder);

export default router;
