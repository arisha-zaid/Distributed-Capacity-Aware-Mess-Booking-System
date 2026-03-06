const cron = require("node-cron");
const pool = require("../config/db");
const redis = require("../config/redis");


// SLOT AUTO CLOSE
cron.schedule(
  "* * * * *",
  async () => {
    try {

      const result = await pool.query(`
        UPDATE slots
        SET status = 'CLOSED'
        WHERE status IN ('OPEN','FULL')
        AND NOW() >= (date + end_time)::timestamp
        RETURNING id;
      `);

      for (const row of result.rows) {
        const inventoryKey = `slot:${row.id}:available`;
        await redis.set(inventoryKey, 0);
      }

      if (result.rowCount > 0) {
        console.log(`Auto closed ${result.rowCount} slots`);
      }

    } catch (err) {
      console.error("Cron failed:", err);
    }
  },
  {
    timezone: "Asia/Kolkata",
  }
);


// MIDNIGHT CLEANUP
cron.schedule(
  "0 0 * * *",
  async () => {
    try {

      const oldSlots = await pool.query(`
        SELECT id FROM slots
        WHERE date < CURRENT_DATE
      `);

      for (const slot of oldSlots.rows) {
        await redis.del(`slot:${slot.id}:available`);
      }

      await pool.query(`
        DELETE FROM slots
        WHERE date < CURRENT_DATE
      `);

      console.log("Old slots deleted");

    } catch (err) {
      console.error(err);
    }
  },
  {
    timezone: "Asia/Kolkata",
  }
);