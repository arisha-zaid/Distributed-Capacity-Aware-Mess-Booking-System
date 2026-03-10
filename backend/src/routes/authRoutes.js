const express = require("express");
const passport = require("../config/passport");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/register", authController.register);

router.get("/me", (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  res.json({ user: req.user });
});

router.post(
  "/login",
  passport.authenticate("local"),
  (req, res) => {
    res.json({
      message: "Login successful",
      user: req.user
    });
  }
);

router.post("/logout", (req, res) => {
  req.logout(() => {
    res.json({ message: "Logged out" });
  });
});

router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

module.exports = router;
