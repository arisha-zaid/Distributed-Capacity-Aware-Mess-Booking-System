const pool = require("../config/db");

exports.getSlots = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM slots WHERE date >= CURRENT_DATE ORDER BY date, start_time"
    );

    res.json({
      success: true,
      message: "Slots fetched successfully",
      data: result.rows
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};
