const pool = require("../config/db");
const redis = require("../config/redis");

const reserveScript = `
local inventoryKey = KEYS[1]
local available = redis.call("GET", inventoryKey)

if not available then
  return 0
end

available = tonumber(available)

if available > 0 then
  redis.call("DECR", inventoryKey)
  return 1
else
  return 0
end
`;

exports.bookSlot = async (req, res) => {
  const { userId, slotId, idempotencyKey } = req.body;
  const inventoryKey = `slot:${slotId}:available`;

  try {
    // 1️ Idempotency check
    const existing = await pool.query(
      "SELECT * FROM bookings WHERE idempotency_key = $1",
      [idempotencyKey]
    );

    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    // 2️ Redis atomic decrement
    const reserved = await redis.eval(reserveScript, 1, inventoryKey);

    if (reserved === 0) {
      return res.status(400).json({ error: "Slot Full" });
    }

    // 3️ Start DB transaction
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 4️ Lock slot row
const slotCheck = await client.query(
  `SELECT status, date, start_time, end_time 
   FROM slots 
   WHERE id = $1 
   FOR UPDATE`,
  [slotId]
);

// check slot exists first
if (slotCheck.rows.length === 0) {
  await client.query("ROLLBACK");
  await redis.incr(inventoryKey);
  return res.status(404).json({ error: "Slot not found" });
}

const slot = slotCheck.rows[0];

// IST safe time comparison
const slotEnd = new Date(`${slot.date}T${slot.end_time}+05:30`);
const now = new Date();

// slot expired
if (now > slotEnd) {
  await client.query("ROLLBACK");
  await redis.incr(inventoryKey);
  return res.status(400).json({ error: "Slot expired" });
}

// booking blocked if slot closed/full
if (slot.status === "CLOSED" || slot.status === "FULL") {
  await client.query("ROLLBACK");
  await redis.incr(inventoryKey);
  return res.status(400).json({ error: "Slot not available" });
}

      // 5️ Insert booking
      const booking = await client.query(
        `INSERT INTO bookings (user_id, slot_id, idempotency_key)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [userId, slotId, idempotencyKey]
      );

      // 6️ Decrement capacity + auto-close
      await client.query(
  `UPDATE slots
   SET 
     remaining_capacity = remaining_capacity - 1,
     status = CASE 
       WHEN remaining_capacity - 1 <= 0 THEN 'FULL'
       ELSE 'OPEN'
     END
   WHERE id = $1`,
  [slotId]
);

      await client.query("COMMIT");

      return res.json(booking.rows[0]);

    } catch (dbError) {
      await client.query("ROLLBACK");
      await redis.incr(inventoryKey); // compensation
      return res.status(500).json({ error: dbError.message });

    } finally {
      client.release();
    }

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
