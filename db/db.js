const { Pool } = require("pg");

const pool = new Pool({
  connectionString:
    "postgresql://binance_symbols_user:DkoPJVfv4BPho94J6AZ6QwPbm7iRuohO@dpg-d2ne7iq4d50c73e945c0-a.singapore-postgres.render.com/binance_symbols",
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crypto_symbol_status (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL UNIQUE,
      status VARCHAR(20) NOT NULL,
      in_long BOOLEAN DEFAULT FALSE,
      buy_time TIMESTAMP,
      sell_time TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function updateSymbolStatus(
  symbol,
  status,
  buyTime = null,
  sellTime = null,
  inLong = null
) {
  await pool.query(
    `INSERT INTO crypto_symbol_status (symbol, status, buy_time, sell_time, in_long, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (symbol) DO UPDATE SET status = $2, buy_time = $3, sell_time = $4, in_long = $5, updated_at = CURRENT_TIMESTAMP;`,
    [symbol, status, buyTime, sellTime, inLong]
  );
}

async function getSymbolStatus(symbol) {
  const res = await pool.query(
    "SELECT * FROM crypto_symbol_status WHERE symbol = $1",
    [symbol]
  );
  return res.rows[0];
}

module.exports = {
  pool,
  initDB,
  updateSymbolStatus,
  getSymbolStatus,
};
