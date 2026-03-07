const pool = require("./config/db");

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slots (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      total_capacity INTEGER NOT NULL CHECK (total_capacity >= 0),
      remaining_capacity INTEGER NOT NULL CHECK (remaining_capacity >= 0),
      status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
      meal_type VARCHAR(50),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      slot_id INTEGER NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
      idempotency_key VARCHAR(255) NOT NULL UNIQUE,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_slots_date_start_time
    ON slots(date, start_time);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bookings_slot_id
    ON bookings(slot_id);
  `);
}

module.exports = createTables;
