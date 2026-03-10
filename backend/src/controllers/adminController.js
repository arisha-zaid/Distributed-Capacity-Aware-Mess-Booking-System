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
      return res.status(400).json({ 
        success: false, 
        message: "Cannot create slots for past dates" 
      });
    }

     // check overlap
    const clashCheck = await pool.query(
      `SELECT * FROM slots
       WHERE date = $1
       AND ($2 < end_time AND $3 > start_time)`,
      [date, start_time, end_time]
    );

    if (clashCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Slot timing conflicts with existing slot"
      });
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
      success: true,
      message: "Slot created successfully",
      data: slot,
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};


// FILTER SLOTS
exports.filterSlots = async (req, res) => {
  const { date, meal_type, status } = req.query;

  try {
    let query = `
      SELECT 
        *,
        (total_capacity - remaining_capacity) AS booked,
        CASE 
          WHEN total_capacity = 0 THEN 0
          ELSE ROUND(((total_capacity - remaining_capacity)::decimal / total_capacity) * 100)
        END AS fill_percentage
      FROM slots 
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (date) {
      query += ` AND date = $${paramIndex++}`;
      params.push(date);
    }

    if (meal_type && meal_type.toLowerCase() !== 'all') {
      query += ` AND meal_type = $${paramIndex++}`;
      params.push(meal_type.toUpperCase());
    }

    if (status && status.toLowerCase() !== 'all') {
      query += ` AND status = $${paramIndex++}`;
      params.push(status.toUpperCase());
    }

    query += ` ORDER BY date ASC, start_time ASC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      message: "Filtered slots fetched successfully",
      data: result.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to filter slots" 
    });
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

    res.json({
      success: true,
      message: "Slots fetched successfully",
      data: result.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch slots" 
    });
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
      return res.status(404).json({ 
        success: false, 
        message: "Slot not found" 
      });
    }

    const currentCapacity = slot.rows[0].total_capacity;
    const remainingCapacity = slot.rows[0].remaining_capacity;
    const status = slot.rows[0].status;

    const booked = currentCapacity - remainingCapacity;

    if (capacity < booked) {
      return res.status(400).json({
        success: false,
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
      success: true,
      message: "Capacity updated successfully",
      data: updatedSlot,
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
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
      return res.status(404).json({ 
        success: false, 
        message: "Slot not found" 
      });
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
      success: true,
      message: "Slot closed successfully",
      data: closedSlot,
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
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

    res.json({
      success: true,
      message: "Bookings per day fetched successfully",
      data: result.rows
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
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

    res.json({
      success: true,
      message: "Slot utilization fetched successfully",
      data: result.rows
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};


//SlOT GRAPH ANALYTICS
exports.getBookingsAnalytics = async (req, res) => {
  try {

    const totalBookings = await pool.query(
      "SELECT COUNT(*) FROM bookings"
    );

    const todayBookings = await pool.query(
      "SELECT COUNT(*) FROM bookings WHERE DATE(created_at) = CURRENT_DATE"
    );

    const slotWise = await pool.query(`
      SELECT slots.start_time, COUNT(bookings.id) as total
      FROM bookings
      JOIN slots ON bookings.slot_id = slots.id
      GROUP BY slots.start_time
    `);

    res.json({
      success: true,
      message: "Analytics fetched successfully",
      data: {
        totalBookings: totalBookings.rows[0].count,
        todayBookings: todayBookings.rows[0].count,
        slotWise: slotWise.rows
      }
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};
