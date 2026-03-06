const pool = require("../config/db");
const redis = require("../config/redis");

const reserveScript = `
local inventoryKey = KEYS[1]
local available = tonumber(redis.call("GET", inventoryKey))

if available and available > 0 then
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
    // 1️⃣ Idempotency check
    const existing = await pool.query(
      "SELECT * FROM bookings WHERE idempotency_key = $1",
      [idempotencyKey]
    );

    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    // 2️⃣ Redis atomic decrement
    const reserved = await redis.eval(reserveScript, 1, inventoryKey);

    if (reserved === 0) {
      return res.status(400).json({ error: "Slot Full" });
    }

    // 3️⃣ Start DB transaction
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 4️⃣ Lock slot row
      const slotCheck = await client.query(
        `SELECT status FROM slots WHERE id = $1 FOR UPDATE`,
        [slotId]
      );

      if (
        slotCheck.rows.length === 0 ||
        slotCheck.rows[0].status !== "OPEN"
      ) {
        await client.query("ROLLBACK");
        await redis.incr(inventoryKey); // compensation
        return res.status(400).json({ error: "Slot Closed" });
      }

      // 5️⃣ Insert booking
      const booking = await client.query(
        `INSERT INTO bookings (user_id, slot_id, idempotency_key)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [userId, slotId, idempotencyKey]
      );

      // 6️⃣ Decrement capacity + auto-close
      await client.query(
        `UPDATE slots
         SET 
           remaining_capacity = remaining_capacity - 1,
           status = CASE 
             WHEN remaining_capacity - 1 <= 0 THEN 'CLOSED'
             ELSE status
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

// exports.bookSlot = async (req, res) => {
//   console.log("BOOK ROUTE HIT");
//   console.log("Body:", req.body);

//   const { userId, slotId, idempotencyKey } = req.body;
//   const inventoryKey = `slot:${slotId}:available`;
  

//   try {
//     // 1️⃣ Idempotency check
//     const existing = await pool.query(
//       "SELECT * FROM bookings WHERE idempotency_key = $1",
//       [idempotencyKey]
//     );

//     if (existing.rows.length > 0) {
//       return res.json(existing.rows[0]);
//     }

//     // 2️⃣ Redis atomic decrement
//     const reserved = await redis.eval(reserveScript, 1, inventoryKey);

//     if (reserved === 0) {
//       return res.status(400).json({ error: "Slot Full" });
//     }

//     // 3️⃣ Start DB transaction (REAL one)
//     const client = await pool.connect();

//     try {
//       await client.query("BEGIN");

//       const booking = await client.query(
//         `INSERT INTO bookings (user_id, slot_id, idempotency_key)
//          VALUES ($1, $2, $3)
//          RETURNING *`,
//         [userId, slotId, idempotencyKey]
//       );

//       await client.query(
//      `UPDATE slots
//       SET 
//      remaining_capacity = remaining_capacity - 1,
//      status = CASE 
//        WHEN remaining_capacity - 1 <= 0 THEN 'CLOSED'
//        ELSE status
//      END
//      WHERE id = $1`,
//      [slotId]
//     );

//       await client.query("COMMIT");

//       return res.json(booking.rows[0]);

//     } catch (dbError) {
//       await client.query("ROLLBACK");
//       await redis.incr(inventoryKey); // compensation
//       return res.status(500).json({ error: dbError.message });
//     } finally {
//       client.release();
//     }

//   } catch (err) {
//     return res.status(500).json({ error: err.message });
//   }
// };