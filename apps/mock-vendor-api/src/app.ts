import express from "express";
import vendorRoutes from "./routes/vendor.js";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
	res.json({ status: "ok" });
});

app.use("/dispatch", vendorRoutes);

export default app;
