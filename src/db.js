const fs = require("graceful-fs");
const low = require("lowdb");
const FileSyncAtomic = require("./adapters/FileSyncAtomic");

// create state directory if it doesn't exist (otherwise lowdb will fail to write to it)
if (!fs.existsSync(process.env.STATE_DIR)) {
  fs.mkdirSync(process.env.STATE_DIR);
}

// initialize lowdb instance with atomic file sync adapter
const adapter = new FileSyncAtomic(`${process.env.STATE_DIR}/state.json`);
const db = low(adapter);

// when db is empty, initialize it with default schema and persist
db.defaults({ disabled: false, critical: [], extended: [] }).write();

module.exports = db;
