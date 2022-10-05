import db from "../db.js";
import { getDisabledServerReason } from "../utils.js";

// returns a disabled flag status
export default function diabled(req, res) {
  res.send({ disabled: getDisabledServerReason(db.data.disabled) });
}
