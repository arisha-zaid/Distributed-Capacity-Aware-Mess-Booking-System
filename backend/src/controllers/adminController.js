const pool = require("../config/db");
const redis = require("../config/redis");


// CREATE SLOT
exports.createSlot = async (req, res) => {
  console.log("Create Slot Hit - New Code Active");
  const { date, start_time, end_time, capacity, meal_type } = req.body;

  try {
   // Prevent backdated slots
    const today = new Date();
    today.setHours(0, 0, 0, 0); // normalize to midnight

    const slotDate = new Date(date);
    if (slotDate < today) {
      return res.status(400).json({ error: "Cannot create slots for past dates" });
    }

    //Insert in postgresql
    const numCapacity = parseInt(capacity);
    const result = await pool.query(
      `INSERT INTO slots 
      (date, start_time, end_time, total_capacity, remaining_capacity, status, meal_type)
      VALUES ($1,$2,$3,$4,$4,'OPEN',$5)
      RETURNING *`,
      [date, start_time, end_time, numCapacity, meal_type]
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

// GET ALL SLOTS
exports.getAllSlots = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        *,
        (total_capacity - remaining_capacity) AS booked,
        CASE 
          WHEN total_capacity = 0 THEN 0
          ELSE ROUND(((total_capacity - remaining_capacity)::decimal / total_capacity) * 100)
        END AS fill_percentage
      FROM slots 
      ORDER BY date ASC, start_time ASC
    `);

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch slots" });
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
    const status = slot.rows[0].status;

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
           remaining_capacity=$2,
           status=$3
       WHERE id=$4
       RETURNING *`,
      [capacity, newRemaining, status, slotId]
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

    // Sync to Redis (set available to 0)
    await redis.set(`slot:${slotId}:available`, 0);

    // Get the updated slot with computed fields
    const updatedResult = await pool.query(`
      SELECT
        s.*,
        COALESCE(b.booked_count, 0) AS booked,
        ROUND((COALESCE(b.booked_count, 0)::numeric / NULLIF(s.total_capacity, 0)) * 100) AS fill_percentage
      FROM slots s
      LEFT JOIN (
        SELECT slot_id, COUNT(*) AS booked_count
        FROM bookings
        GROUP BY slot_id
      ) b ON s.id = b.slot_id
      WHERE s.id = $1
    `, [slotId]);

    const closedSlot = updatedResult.rows[0];

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
      SELECT 
        DATE(created_at) as day,
        COUNT(*) as bookings
      FROM bookings
      WHERE status = 'booked'
      GROUP BY day
      ORDER BY day ASC
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