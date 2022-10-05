import fs from "node:fs";
import { LowSync, JSONFileSync } from "lowdb";

// create state directory if it doesn't exist (otherwise lowdb will fail to write to it)
if (!fs.existsSync(process.env.STATE_DIR)) {
  fs.mkdirSync(process.env.STATE_DIR);
}

// initialize lowdb instance with atomic file sync adapter
const db = new LowSync(new JSONFileSync(`${process.env.STATE_DIR}/state.json`));

// initialize db with default data and persist
db.read();
db.data = { disabled: false, critical: [], extended: [], ...db.data };
db.write();

export default db;
