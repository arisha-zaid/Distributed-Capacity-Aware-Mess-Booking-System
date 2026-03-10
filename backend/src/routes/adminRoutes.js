const express = require("express");
const router = express.Router();

const adminController = require("../controllers/adminController");
const requireAdmin = require("../middlewares/requireAdmin");

router.get("/test", requireAdmin, (req, res) => {
  res.json({ message: "Admin route working" });
});

// CREATE SLOT
router.post(
  "/slots",
  requireAdmin,
  adminController.createSlot
);

// GET ALL SLOTS FOR ADMIN TABLE
router.get("/slots",
  requireAdmin,
  adminController.getAllSlots
);

// FILTER SLOTS
router.get("/slots/filter",
  requireAdmin,
  adminController.filterSlots
);

// UPDATE CAPACITY
router.put(
  "/slots/:slotId/capacity",
  requireAdmin,
  adminController.updateCapacity
);


// FORCE CLOSE SLOT
router.put(
  "/slots/:slotId/close",
  requireAdmin,
  adminController.closeSlot
);


// ANALYTICS ROUTES

router.get(
  "/analytics/bookings-per-day",
  requireAdmin,
  adminController.getBookingsPerDay
);

router.get(
  "/analytics/slot-utilization",
  requireAdmin,
  adminController.getSlotUtilization
);

router.get("/analytics",
  requireAdmin,
  adminController.getBookingsAnalytics
);


module.exports = router;
