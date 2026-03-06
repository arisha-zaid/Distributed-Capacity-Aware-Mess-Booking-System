const cron = require('node-cron');
const pool = require('../config/db');
const redis = require('../config/redis');

cron.schedule('* * * * *', async () => {
  try {
    const result = await pool.query(`
      UPDATE slots
      SET status = 'CLOSED'
      WHERE status = 'OPEN'
      AND NOW() >= (date + end_time)
      RETURNING id;
    `);

    // Sync Redis for closed slots
    for (const row of result.rows) {
      const inventoryKey = `slot:${row.id}:available`;
      await redis.set(inventoryKey, 0);
    }

    if (result.rowCount > 0) {
      console.log(`Auto-closed ${result.rowCount} expired slots`);
    }

  } catch (err) {
    console.error("Cron failed:", err);
  }
});