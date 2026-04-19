import express from "express";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import orderRoutes from "./routes/orders.js";
import approvalRoutes from "./routes/approvals.js";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/orders", authMiddleware, orderRoutes);
app.use("/webhooks/approval", authMiddleware, approvalRoutes);

app.use(errorHandler);

export default app;
