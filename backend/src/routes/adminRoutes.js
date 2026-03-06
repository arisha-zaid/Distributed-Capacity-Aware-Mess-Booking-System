const express = require("express");
const router = express.Router();

const adminController = require("../controllers/adminController");
const adminMiddleware = require("../middleware/adminMiddleware");

router.get("/test", (req, res) => {
  res.json({ message: "Admin route working" });
});

// CREATE SLOT
router.post(
  "/slots",
  adminController.createSlot
);


// UPDATE CAPACITY
router.put(
  "/slots/:slotId/capacity",
  adminController.updateCapacity
);


// FORCE CLOSE SLOT
router.put(
  "/slots/:slotId/close",
  adminController.closeSlot
);


// ANALYTICS ROUTES

router.get(
  "/analytics/bookings-per-day",
  adminController.getBookingsPerDay
);

router.get(
  "/analytics/slot-utilization",
  adminController.getSlotUtilization
);

module.exports = router;