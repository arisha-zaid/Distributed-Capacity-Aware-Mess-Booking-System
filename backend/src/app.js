const express = require("express");
const cors = require("cors");
require("./cron/autoCloseSlots");

const slotRoutes = require("./routes/slotRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/slots", slotRoutes);
app.use("/bookings", bookingRoutes);
app.use("/admin", adminRoutes);

module.exports = app;