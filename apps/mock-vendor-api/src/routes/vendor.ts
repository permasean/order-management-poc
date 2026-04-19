import { Router } from "express";
import { submitDispatch, checkTechAssignment } from "../controllers/vendor.js";

const router = Router();

router.post("/", submitDispatch);
router.get("/:von", checkTechAssignment);

export default router;
