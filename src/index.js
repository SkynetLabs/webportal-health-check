import express from "express";
import { isPortalModuleEnabled, ipRegex } from "./utils.js";
import db from "./db.js";
import indexRoute from "./routes/index.js";
import criticalRoute from "./routes/critical.js";
import extendedRoute from "./routes/extended.js";
import disabledRoute from "./routes/disabled.js";

process.env.NODE_ENV = process.env.NODE_ENV || "development";

// when portal domain is not provided
if (!process.env.PORTAL_DOMAIN) {
  throw new Error("PORTAL_DOMAIN environment variable cannot be empty");
}

if (isPortalModuleEnabled("a")) {
  // when portal is set to allow only authenticated requests
  if (["authenticated", "subscription"].includes(process.env.ACCOUNTS_LIMIT_ACCESS)) {
    // when test api key is not provided
    if (!process.env.ACCOUNTS_TEST_USER_API_KEY) {
      throw new Error("ACCOUNTS_TEST_USER_API_KEY environment variable cannot be empty");
    }
  }
}

// prepare express server instance
const server = express();

// install built in middleware for parsing incoming requests with urlencoded payloads
server.use(express.urlencoded({ extended: false }));
// install built in middleware for parsing application/json
server.use(express.json());
// middleware to reload db in memory on every request
server.use((req, res, next) => {
  db.read();
  next();
});

// display current health check status (shows only failed checks if any)
// note: response code will be 200 when status is up and 503 otherwise
server.get("/health-check", indexRoute);

// display critical checks (last 24 hours)
server.get("/health-check/critical", criticalRoute);

// display extended checks (last 24 hours)
server.get("/health-check/extended", extendedRoute);

// display information whether server is set to disabled
server.get("/health-check/disabled", disabledRoute);

// prepare express server configuration options
const host = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT) || 3100;

// start express server
server.listen(port, host, (error) => {
  if (error) throw error;

  console.info(`Server listening at http://${host}:${port} (NODE_ENV: ${process.env.NODE_ENV})`);

  if (ipRegex.test(process.env.serverip)) {
    console.info(`Server public ip: ${process.env.serverip}`);
  }
});
