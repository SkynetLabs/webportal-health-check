const db = require("../db");
const { getDisabledServerReason } = require("../utils");

// returns a disabled flag status
module.exports = (req, res) => {
  const manualDisabledReason = db.get("disabled").value();

  res.send({ disabled: getDisabledServerReason(manualDisabledReason) });
};
