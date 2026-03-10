const express = require("express");
const cors = require("cors");
require("./cron/autoCloseSlots");
const session = require("express-session");
const passport = require("./config/passport");

const slotRoutes = require("./routes/slotRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const adminRoutes = require("./routes/adminRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use(
  session({
    secret: "smartmess_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 86400000
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use("/slots", slotRoutes);
app.use("/bookings", bookingRoutes);
app.use("/admin", adminRoutes);
app.use("/auth", authRoutes);

module.exports = app;