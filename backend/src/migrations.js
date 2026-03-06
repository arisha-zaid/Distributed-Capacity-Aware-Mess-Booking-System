const pool = require("./config/db");

const createTables = async () => {
  const query = `
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS slots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      total_capacity INTEGER NOT NULL,
      remaining_capacity INTEGER NOT NULL,
      status VARCHAR(20) DEFAULT 'OPEN',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      slot_id UUID REFERENCES slots(id),
      status VARCHAR(20) DEFAULT 'booked',
      qr_token TEXT,
      idempotency_key TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(query);
    console.log("Tables created successfully");
  } catch (err) {
    console.error("Error creating tables:", err);
  }
};

module.exports = createTables;
