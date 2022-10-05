import { chain } from "lodash-es";
import db from "../db.js";
import { getYesterdayISOString } from "../utils.js";

// returns all critical health check entries
export default function critical(req, res) {
  const yesterday = getYesterdayISOString();
  const entries = chain(db.data)
    .get("critical")
    .orderBy("date", "desc")
    .filter(({ date }) => date > yesterday)
    .value();

  res.send(entries);
}
