const pool = require("../config/db");
const redis = require("../config/redis");


// CREATE SLOT
exports.createSlot = async (req, res) => {
  console.log("Create Slot Hit - New Code Active");
  const { date, start_time, end_time, capacity } = req.body;

  try {
    const numCapacity = parseInt(capacity);
    const result = await pool.query(
      `INSERT INTO slots 
      (date, start_time, end_time, total_capacity, remaining_capacity, status)
      VALUES ($1,$2,$3,$4,$4,'OPEN')
      RETURNING *`,
      [date, start_time, end_time, numCapacity]
    );

    const slot = result.rows[0];

    // Sync to Redis
    await redis.set(`slot:${slot.id}:available`, slot.remaining_capacity);

    res.status(201).json({
      message: "Slot created successfully",
      slot: slot,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// UPDATE CAPACITY
exports.updateCapacity = async (req, res) => {
  const { slotId } = req.params;
  const { capacity } = req.body;

  try {

    const slot = await pool.query(
      `SELECT total_capacity, remaining_capacity 
       FROM slots WHERE id=$1`,
      [slotId]
    );

    if (slot.rows.length === 0) {
      return res.status(404).json({ message: "Slot not found" });
    }

    const currentCapacity = slot.rows[0].total_capacity;
    const remainingCapacity = slot.rows[0].remaining_capacity;

    const booked = currentCapacity - remainingCapacity;

    if (capacity < booked) {
      return res.status(400).json({
        message: "New capacity cannot be less than already booked seats",
      });
    }

    const newRemaining = capacity - booked;

    const updated = await pool.query(
      `UPDATE slots
       SET total_capacity=$1,
           remaining_capacity=$2
       WHERE id=$3
       RETURNING *`,
      [capacity, newRemaining, slotId]
    );

    const updatedSlot = updated.rows[0];

    // Sync to Redis
    await redis.set(`slot:${updatedSlot.id}:available`, updatedSlot.remaining_capacity);

    res.json({
      message: "Capacity updated",
      slot: updatedSlot,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// FORCE CLOSE SLOT
exports.closeSlot = async (req, res) => {
  const { slotId } = req.params;

  try {

    const result = await pool.query(
      `UPDATE slots
       SET status='CLOSED'
       WHERE id=$1
       RETURNING *`,
      [slotId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Slot not found" });
    }

    const closedSlot = result.rows[0];

    // Sync to Redis (set available to 0)
    await redis.set(`slot:${closedSlot.id}:available`, 0);

    res.json({
      message: "Slot closed successfully",
      slot: closedSlot,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// BOOKINGS PER DAY ANALYTICS
exports.getBookingsPerDay = async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT date, COUNT(*) AS total_bookings
      FROM bookings
      GROUP BY date
      ORDER BY date DESC
    `);

    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// SLOT UTILIZATION ANALYTICS
exports.getSlotUtilization = async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        id,
        date,
        start_time,
        total_capacity,
        (total_capacity - remaining_capacity) AS booked,
        CASE 
          WHEN total_capacity = 0 THEN 0
          ELSE ROUND(
            ((total_capacity - remaining_capacity)::decimal / total_capacity) * 100,
            2
          )
        END AS fill_percentage
      FROM slots
      ORDER BY date DESC
    `);

    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};