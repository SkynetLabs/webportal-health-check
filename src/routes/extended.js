import { chain } from "lodash-es";
import db from "../db.js";
import { getYesterdayISOString } from "../utils.js";

// returns all extended health check entries
export default function extended(req, res) {
  const yesterday = getYesterdayISOString();
  const entries = chain(db.data)
    .get("extended")
    .orderBy("date", "desc")
    .filter(({ date }) => date > yesterday)
    .value();

  res.send(entries);
}
