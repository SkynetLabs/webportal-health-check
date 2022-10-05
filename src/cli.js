import util from "node:util";
import yargs from "yargs/yargs";
import db from "./db.js";
import { getYesterdayISOString } from "./utils.js";
import createMiddleware from "./checks/middleware.js";

process.env.NODE_ENV = process.env.NODE_ENV || "production";

yargs(process.argv.slice(2))
  .help()
  .demandCommand()
  .strict(true)
  .command(
    "enable",
    "Mark portal as enabled",
    () => {},
    () => {
      db.read();
      db.data.disabled = false;
      db.write();
    }
  )
  .command(
    "disable <reason>",
    "Mark portal as disabled (provide meaningful reason)",
    () => {},
    ({ reason }) => {
      db.read();
      db.data.disabled = reason;
      db.write();
    }
  )
  .command(
    "run <type>",
    "Skynet portal health checks",
    (yargs) => {
      yargs
        .positional("type", {
          describe: "Type of checks to run",
          type: "string",
          choices: ["critical", "extended"],
        })
        .option("portal-url", {
          describe: "Skynet portal url",
          default: process.env.PORTAL_DOMAIN ? `https://${process.env.PORTAL_DOMAIN}` : "https://siasky.net",
          type: "string",
        })
        .option("state-dir", {
          describe: "State directory",
          default: process.env.STATE_DIR || "state",
          type: "string",
        });
    },
    async ({ type, portalUrl, stateDir }) => {
      const { hostname: portalDomain } = new URL(portalUrl); // extract domain from portal url
      process.env.PORTAL_DOMAIN = portalDomain;
      process.env.STATE_DIR = stateDir;

      const module = await import(`../src/checks/${type}.js`);
      const checks = module.default ? module.default : Object.values(module);
      const middleware = await createMiddleware();

      const entry = {
        date: new Date().toISOString(),
        // run all checks, filter empty responses (skipped) and pass the response through the middleware
        checks: (await Promise.all(checks.map((check) => check()))).filter(Boolean).map(middleware),
      };

      db.read(); // read before writing to make sure no external changes are overwritten
      db.data[type].push(entry); // insert new record of given type
      db.data[type].filter(({ date }) => date > getYesterdayISOString()); // drop old records
      db.write(); // write after truncating the records list

      // exit with code 1 if any of the checks report failure
      if (entry.checks.some(({ up }) => !up)) {
        console.log(
          util.inspect(
            entry.checks.filter(({ up }) => !up),
            { colors: true, depth: 7 } // increase depth to ensure errors are printed
          )
        );
        process.exit(1);
      }
    }
  ).argv;
