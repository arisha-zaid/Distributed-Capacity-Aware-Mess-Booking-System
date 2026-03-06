const express = require("express");
const router = express.Router();

const slotController = require("../controllers/slotController");

// GET /api/slots
// Students fetch available slots
router.get("/", slotController.getSlots);

module.exports = router;