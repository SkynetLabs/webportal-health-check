import got from "got";
import { ipCheckService, ipRegex } from "../utils.js";

/**
 * Ask ip check service for current machine external ip address
 */
async function getCurrentAddress() {
  // use serverip env variable when available (set via Dockerfile)
  if (process.env.serverip) {
    if (ipRegex.test(process.env.serverip)) return process.env.serverip;

    // log error to console for future reference but do not break
    console.log(`Environment variable serverip contains invalid ip: "${process.env.serverip}"`);
  }

  try {
    const { body } = await got(`http://${ipCheckService}`);
    if (ipRegex.test(body)) {
      console.info(`Server public ip: ${body} (source: ${ipCheckService})`);

      return body;
    }

    throw new Error(`${ipCheckService} responded with invalid ip: "${body}"`);
  } catch (error) {
    console.log(error.message); // log error to console for future reference

    return null;
  }
}

export default async function middleware() {
  const ip = await getCurrentAddress(); // get current machine ip address

  return (check) => {
    // ip comparison check middleware - executes only if current ip and check ip are provided
    // reasoning: we had issues with health checks executing against different machines in cluster
    // so we want to double check that we're running the checks against the machine that runs them
    if (ip && check.ip && check.ip !== ip) {
      check.up = false;
      check.errors = check.errors ?? [];
      check.errors.push({
        message: "Response ip was different than current server ip - possibly there was an error with routing request",
        data: { response: check.ip, server: ip },
      });
    }

    return check;
  };
}
