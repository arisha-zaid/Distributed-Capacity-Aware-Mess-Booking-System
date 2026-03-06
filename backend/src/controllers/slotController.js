const pool = require("../config/db");

exports.getSlots = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM slots WHERE status = 'OPEN' ORDER BY date, start_time"
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};