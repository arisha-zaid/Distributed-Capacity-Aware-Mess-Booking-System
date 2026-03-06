const express = require("express");
const router = express.Router();

const bookingController = require("../controllers/bookingController");

// POST /api/bookings
// Student books a slot
router.post("/", bookingController.bookSlot);

module.exports = router;