const bcrypt = require("bcrypt");
const crypto = require("crypto");
const pool = require("../config/db");

exports.register = async (req, res) => {
  try {
    const { name, email, password, roll_no } = req.body;
    const hashed = await bcrypt.hash(password, 10);

    const user = await pool.query(
      `INSERT INTO users(name,email,password,roll_no)
       VALUES($1,$2,$3,$4)
       RETURNING id,name,email`,
      [name, email, hashed, roll_no]
    );

    res.json({
      message: "User registered successfully",
      user: user.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const userResult = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const userId = userResult.rows[0].id;
    const token = crypto.randomBytes(32).toString("hex");

    await pool.query(
      "INSERT INTO password_resets(user_id, token, expires_at) VALUES($1, $2, NOW() + INTERVAL '1 hour')",
      [userId, token]
    );

    res.json({ message: "Reset token generated", token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const resetResult = await pool.query(
      "SELECT user_id FROM password_resets WHERE token = $1 AND expires_at > NOW()",
      [token]
    );

    if (resetResult.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const userId = resetResult.rows[0].user_id;
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedPassword, userId]);
    await pool.query("DELETE FROM password_resets WHERE token = $1", [token]);

    res.json({ message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
