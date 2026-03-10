const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const bookingController = require("../controllers/bookingController");

// POST /api/bookings
// Student books a slot
router.post("/", authMiddleware.isAuthenticated,bookingController.bookSlot);

module.exports = router;