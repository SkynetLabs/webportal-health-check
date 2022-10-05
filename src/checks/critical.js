import util from "node:util";
import got from "got";
import FormData from "form-data";
import { isEqual } from "lodash-es";
import tus from "tus-js-client";
import { calculateElapsedTime, getResponseErrorData, isPortalModuleEnabled } from "../utils.js";
import { genKeyPairAndSeed, getRegistryEntry, setRegistryEntry } from "../utils-registry.js";

const exampleSkylink = "AACogzrAimYPG42tDOKhS3lXZD8YvlF8Q8R17afe95iV2Q";
const exampleSkylinkBase32 = "000ah0pqo256c3orhmmgpol19dslep1v32v52v23ohqur9uuuuc9bm8";

// this resolver skylink points to latest release of webportal-website and
// is updated automatically on each merged pull request via github-actions
// source: https://github.com/SkynetLabs/webportal-website
const exampleResolverSkylink = "AQCExZYFmmc75OPgjPpHuF4WVN0pc4FX2p09t4naLKfTLw";

// check that any relevant configuration is properly set in skyd
export async function skydConfigCheck() {
  const time = process.hrtime();
  const data = { up: false };

  try {
    const response = await got(`http://10.10.10.10:9980/renter`, {
      headers: { "User-Agent": "Sia-Agent" },
      timeout: { connect: 5000 }, // timeout after 5 seconds when skyd is not available
    }).json();

    // make sure initial funding is set to 10SC
    if (response.settings.allowance.paymentcontractinitialfunding !== "10000000000000000000000000") {
      throw new Error("Skynet Portal Per-Contract Budget is not set correctly!");
    }

    data.up = true;
  } catch (error) {
    Object.assign(data, getResponseErrorData(error)); // extend data object with error data
  }

  return { name: "skyd_config", time: calculateElapsedTime(time), ...data };
}

// check skyd for total number of workers on cooldown
export async function skydWorkersCooldownCheck() {
  const workersCooldownThreshold = 0.6; // set to 60% initially, can be increased later
  const time = process.hrtime();
  const data = { up: false };

  try {
    const response = await got(`http://10.10.10.10:9980/renter/workers`, {
      headers: { "User-Agent": "Sia-Agent" },
      timeout: { connect: 5000 }, // timeout after 5 seconds when skyd is not available
    }).json();

    const workersCooldown =
      response.totaldownloadcooldown + response.totalmaintenancecooldown + response.totaluploadcooldown;
    const workersCooldownRatio = workersCooldown / response.numworkers;

    if (workersCooldownRatio > workersCooldownThreshold) {
      const workersCooldownPercentage = Math.floor(workersCooldownRatio * 100);
      const workersCooldownThresholdPercentage = Math.floor(workersCooldownThreshold * 100);

      throw new Error(
        `${workersCooldown}/${response.numworkers} skyd workers on cooldown (current ${workersCooldownPercentage}%, threshold ${workersCooldownThresholdPercentage}%)`
      );
    }

    data.up = true;
  } catch (error) {
    Object.assign(data, getResponseErrorData(error)); // extend data object with error data
  }

  return { name: "skyd_renter_workers", time: calculateElapsedTime(time), ...data };
}

// uploadCheck returns the result of uploading a sample file
export async function uploadCheck() {
  const time = process.hrtime();
  const form = new FormData();
  const payload = Buffer.from(new Date()); // current date to ensure data uniqueness
  const data = { up: false };

  form.append("file", payload, { filename: "time.txt", contentType: "text/plain" });

  try {
    const response = await got.post(`https://${process.env.PORTAL_DOMAIN}/skynet/skyfile`, {
      body: form,
      headers: { "Skynet-Api-Key": process.env.ACCOUNTS_TEST_USER_API_KEY },
    });

    data.statusCode = response.statusCode;
    data.up = true;
    data.ip = response.ip;
  } catch (error) {
    Object.assign(data, getResponseErrorData(error)); // extend data object with error data
  }

  return { name: "upload_file", time: calculateElapsedTime(time), ...data };
}

// uploadTusCheck returns the result of uploading a sample file through tus endpoint
export async function uploadTusCheck() {
  const time = process.hrtime();
  const headers = { "Skynet-Api-Key": process.env.ACCOUNTS_TEST_USER_API_KEY ?? "" };
  const payload = Buffer.from(new Date()); // current date to ensure data uniqueness
  const data = { name: "upload_file_tus", up: false };

  try {
    return new Promise((resolve, reject) => {
      const upload = new tus.Upload(payload, {
        endpoint: `https://${process.env.PORTAL_DOMAIN}/skynet/tus`,
        headers,
        onError: (error) => {
          reject(error); // reject with error to trigger failed check
        },
        onSuccess: async () => {
          const response = await got.head(upload.url, { headers });
          const skylink = response.headers["skynet-skylink"];
          resolve({ time: calculateElapsedTime(time), ...data, skylink, up: Boolean(skylink) });
        },
      });

      upload.start();
    });
  } catch (error) {
    Object.assign(data, getResponseErrorData(error)); // extend data object with error data

    return { name: "upload_file_tus", time: calculateElapsedTime(time), ...data };
  }
}

// websiteCheck checks whether the main website is working
export async function websiteCheck() {
  return genericAccessCheck("website", `https://${process.env.PORTAL_DOMAIN}`);
}

// downloadSkylinkCheck returns the result of downloading the hard coded link
export async function downloadSkylinkCheck() {
  const url = `https://${process.env.PORTAL_DOMAIN}/${exampleSkylink}`;

  return genericAccessCheck("skylink", url);
}

// downloadResolverSkylinkCheck returns the result of downloading an example resolver skylink
export async function downloadResolverSkylinkCheck() {
  const url = `https://${process.env.PORTAL_DOMAIN}/${exampleResolverSkylink}`;

  return genericAccessCheck("resolver_skylink", url);
}

// skylinkSubdomainCheck returns the result of downloading the hard coded link via subdomain
export async function skylinkSubdomainCheck() {
  const url = `https://${exampleSkylinkBase32}.${process.env.PORTAL_DOMAIN}`;

  return genericAccessCheck("skylink_via_subdomain", url);
}

// handshakeSubdomainCheck returns the result of downloading the skylink via handshake domain
export async function handshakeSubdomainCheck() {
  const url = `https://note-to-self.hns.${process.env.PORTAL_DOMAIN}`;

  return genericAccessCheck("hns_via_subdomain", url);
}

// accountWebsiteCheck returns the result of accessing account dashboard website
export async function accountWebsiteCheck() {
  if (!isPortalModuleEnabled("a")) return; // runs only when accounts are enabled

  const url = `https://account.${process.env.PORTAL_DOMAIN}/auth/login`;

  return genericAccessCheck("account_website", url);
}

// registryWriteAndReadCheck writes to registry and immediately reads and compares the data
export async function registryWriteAndReadCheck() {
  const time = process.hrtime();
  const data = { name: "registry_write_and_read", up: false };
  const { privateKey, publicKey } = await genKeyPairAndSeed();
  const expected = { dataKey: "foo-key", data: Uint8Array.from(Buffer.from("foo-data", "utf-8")), revision: BigInt(0) };

  try {
    await setRegistryEntry(privateKey, publicKey, expected);
    const entry = await getRegistryEntry(publicKey, expected.dataKey);

    if (isEqual(expected, entry)) {
      data.up = true;
    } else {
      data.errors = [
        {
          message: "Data mismatch in registry (read after write)",
          // use util.inspect to serialize the entries, otherwise built in JSON.stringify will throw error
          // on revision being BigInt (unsupported) and data will not be printed properly as Uint8Array
          received: util.inspect(entry, { breakLength: Infinity, compact: true }),
          expected: util.inspect(expected, { breakLength: Infinity, compact: true }),
        },
      ];
    }
  } catch (error) {
    console.log(error?.request?.body?.message);
    data.errors = [{ message: error?.response?.data?.message ?? error.message }];
  }

  return { ...data, time: calculateElapsedTime(time) };
}

// directServerApiAccessCheck returns the basic server api check on direct server address
export async function directServerApiAccessCheck() {
  // skip if SERVER_DOMAIN is not set or it equals PORTAL_DOMAIN (single server portals)
  if (!process.env.SERVER_DOMAIN || process.env.SERVER_DOMAIN === process.env.PORTAL_DOMAIN) {
    return;
  }

  const [portalAccessCheck, serverAccessCheck] = await Promise.all([
    genericAccessCheck("portal_api_access", `https://${process.env.PORTAL_DOMAIN}`),
    genericAccessCheck("server_api_access", `https://${process.env.SERVER_DOMAIN}`),
  ]);

  if (portalAccessCheck.ip !== serverAccessCheck.ip) {
    serverAccessCheck.up = false;
    serverAccessCheck.errors = serverAccessCheck.errors ?? [];
    serverAccessCheck.errors.push({
      message: "Access ip mismatch between portal and server access",
      response: {
        portal: { name: process.env.PORTAL_DOMAIN, ip: portalAccessCheck.ip },
        server: { name: process.env.SERVER_DOMAIN, ip: serverAccessCheck.ip },
      },
    });
  }

  return serverAccessCheck;
}

// accountHealthCheck returns the result of accounts service health checks
export async function accountHealthCheck(retries = 2) {
  if (!isPortalModuleEnabled("a")) return; // runs only when accounts are enabled

  const time = process.hrtime();
  const data = { up: false };

  try {
    const response = await got(`https://account.${process.env.PORTAL_DOMAIN}/health`, { responseType: "json" });

    data.statusCode = response.statusCode;
    data.response = response.body;
    data.up = response.body.dbAlive === true;
    data.ip = response.ip;
  } catch (error) {
    Object.assign(data, getResponseErrorData(error)); // extend data object with error data
  }

  // db checks can be a false negative due to slow network, retry to make sure it is actually down
  if (data.up === false && retries > 0) {
    setTimeout(() => accountHealthCheck(retries - 1), 3000); // delay 3 seconds and retry
  } else {
    return { name: "accounts", time: calculateElapsedTime(time), ...data };
  }
}

// blockerHealthCheck returns the result of blocker container health endpoint
export async function blockerHealthCheck(retries = 2) {
  if (!isPortalModuleEnabled("b")) return; // runs only when blocker is enabled

  const time = process.hrtime();
  const data = { up: false };

  try {
    const response = await got(`http://${process.env.BLOCKER_HOST}:${process.env.BLOCKER_PORT}/health`, {
      responseType: "json",
    });

    data.statusCode = response.statusCode;
    data.response = response.body;
    data.up = response.body.dbAlive === true;
  } catch (error) {
    Object.assign(data, getResponseErrorData(error)); // extend data object with error data
  }

  // db checks can be a false negative due to slow network, retry to make sure it is actually down
  if (data.up === false && retries > 0) {
    setTimeout(() => blockerHealthCheck(retries - 1), 3000); // delay 3 seconds and retry
  } else {
    return { name: "blocker", time: calculateElapsedTime(time), ...data };
  }
}

async function genericAccessCheck(name, url) {
  const time = process.hrtime();
  const data = { up: false, url };

  try {
    const response = await got(url, { headers: { "Skynet-Api-Key": process.env.ACCOUNTS_TEST_USER_API_KEY } });

    data.statusCode = response.statusCode;
    data.up = true;
    data.ip = response.ip;
  } catch (error) {
    Object.assign(data, getResponseErrorData(error)); // extend data object with error data
  }

  return { name, time: calculateElapsedTime(time), ...data };
}
