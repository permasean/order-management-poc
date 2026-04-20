import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT ?? 3004;

app.listen(PORT, () => {
	console.log(`Order Management API running on port ${PORT}`);
});
