const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const selectedEnvFile = process.env.ENV_FILE || ".env";
const envPath = path.join(__dirname, selectedEnvFile);

if (!fs.existsSync(envPath)) {
  throw new Error(`Env file not found: ${selectedEnvFile}`);
}

dotenv.config({ path: envPath });

const pool = require("./src/config/db");
const redis = require("./src/config/redis");
const createTables = require("./src/migrations");

async function syncSlotsToRedis() {
  try {
    await createTables();
    const slots = await pool.query(
      "SELECT id, remaining_capacity FROM slots"
    );

    for (let slot of slots.rows) {
      const key = `slot:${slot.id}:available`;
      await redis.set(key, slot.remaining_capacity);
    }

    console.log("Slots synced to Redis");
  } catch (err) {
    console.error("Error syncing slots to Redis:", err);
  }
}

const app = require("./src/app");

const portValue = process.env.PORT;
const PORT = Number(portValue);

if (!Number.isInteger(PORT) || PORT <= 0) {
  throw new Error(`Invalid or missing PORT in ${selectedEnvFile}.`);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  syncSlotsToRedis();
});
