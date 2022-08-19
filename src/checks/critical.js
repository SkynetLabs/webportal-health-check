const util = require("node:util");
const got = require("got");
const FormData = require("form-data");
const { isEqual } = require("lodash");
const { calculateElapsedTime, getResponseContent, isPortalModuleEnabled } = require("../utils");
const { SkynetClient, stringToUint8ArrayUtf8, genKeyPairAndSeed } = require("@skynetlabs/skynet-nodejs");

const MODULE_BLOCKER = "b";

const skynetClient = new SkynetClient(`https://${process.env.PORTAL_DOMAIN}`, {
  skynetApiKey: process.env.ACCOUNTS_TEST_USER_API_KEY,
});
const exampleSkylink = "AACogzrAimYPG42tDOKhS3lXZD8YvlF8Q8R17afe95iV2Q";

// this resolver skylink points to latest release of webportal-website and
// is updated automatically on each merged pull request via github-actions
// source: https://github.com/SkynetLabs/webportal-website
const exampleResolverSkylink = "AQCExZYFmmc75OPgjPpHuF4WVN0pc4FX2p09t4naLKfTLw";

// check that any relevant configuration is properly set in skyd
async function skydConfigCheck(done) {
  const time = process.hrtime();
  const data = { up: false };

  try {
    const response = await got(`http://10.10.10.10:9980/renter`, { headers: { "User-Agent": "Sia-Agent" } }).json();

    // make sure initial funding is set to 10SC
    if (response.settings.allowance.paymentcontractinitialfunding !== "10000000000000000000000000") {
      throw new Error("Skynet Portal Per-Contract Budget is not set correctly!");
    }

    data.up = true;
  } catch (error) {
    data.statusCode = error.response?.statusCode || error.statusCode || error.status;
    data.errorMessage = error.message;
    data.errorResponseContent = getResponseContent(error.response);
  }

  done({ name: "skyd_config", time: calculateElapsedTime(time), ...data });
}

// check skyd for total number of workers on cooldown
async function skydWorkersCooldownCheck(done) {
  const workersCooldownThreshold = 0.6; // set to 60% initially, can be increased later
  const time = process.hrtime();
  const data = { up: false };

  try {
    const response = await got(`http://10.10.10.10:9980/renter/workers`, {
      headers: { "User-Agent": "Sia-Agent" },
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
    data.statusCode = error.response?.statusCode || error.statusCode || error.status;
    data.errorMessage = error.message;
    data.errorResponseContent = getResponseContent(error.response);
  }

  done({ name: "skyd_renter_workers", time: calculateElapsedTime(time), ...data });
}

// uploadCheck returns the result of uploading a sample file
async function uploadCheck(done) {
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
    data.statusCode = error.response?.statusCode || error.statusCode || error.status;
    data.errorMessage = error.message;
    data.errorResponseContent = getResponseContent(error.response);
    data.ip = error?.response?.ip ?? null;
  }

  done({ name: "upload_file", time: calculateElapsedTime(time), ...data });
}

// websiteCheck checks whether the main website is working
async function websiteCheck(done) {
  return done(await genericAccessCheck("website", `https://${process.env.PORTAL_DOMAIN}`));
}

// downloadSkylinkCheck returns the result of downloading the hard coded link
async function downloadSkylinkCheck(done) {
  const url = await skynetClient.getSkylinkUrl(exampleSkylink);

  return done(await genericAccessCheck("skylink", url));
}

// downloadResolverSkylinkCheck returns the result of downloading an example resolver skylink
async function downloadResolverSkylinkCheck(done) {
  const url = await skynetClient.getSkylinkUrl(exampleResolverSkylink);

  return done(await genericAccessCheck("resolver_skylink", url));
}

// skylinkSubdomainCheck returns the result of downloading the hard coded link via subdomain
async function skylinkSubdomainCheck(done) {
  const url = await skynetClient.getSkylinkUrl(exampleSkylink, { subdomain: true });

  return done(await genericAccessCheck("skylink_via_subdomain", url));
}

// handshakeSubdomainCheck returns the result of downloading the skylink via handshake domain
async function handshakeSubdomainCheck(done) {
  const url = await skynetClient.getHnsUrl("note-to-self", { subdomain: true });

  return done(await genericAccessCheck("hns_via_subdomain", url));
}

// accountWebsiteCheck returns the result of accessing account dashboard website
async function accountWebsiteCheck(done) {
  const url = `https://account.${process.env.PORTAL_DOMAIN}/auth/login`;

  return done(await genericAccessCheck("account_website", url));
}

// registryWriteAndReadCheck writes to registry and immediately reads and compares the data
async function registryWriteAndReadCheck(done) {
  const time = process.hrtime();
  const data = { name: "registry_write_and_read", up: false };
  const { privateKey, publicKey } = genKeyPairAndSeed();
  const expected = { dataKey: "foo-key", data: stringToUint8ArrayUtf8("foo-data"), revision: BigInt(0) };

  try {
    await skynetClient.registry.setEntry(privateKey, expected);
    const { entry } = await skynetClient.registry.getEntry(publicKey, expected.dataKey);

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
    data.errors = [{ message: error?.response?.data?.message ?? error.message }];
  }

  return done({ ...data, time: calculateElapsedTime(time) });
}

// directServerApiAccessCheck returns the basic server api check on direct server address
async function directServerApiAccessCheck(done) {
  // skip if SERVER_DOMAIN is not set or it equals PORTAL_DOMAIN (single server portals)
  if (!process.env.SERVER_DOMAIN || process.env.SERVER_DOMAIN === process.env.PORTAL_DOMAIN) {
    return done();
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

  return done(serverAccessCheck);
}

// accountHealthCheck returns the result of accounts service health checks
async function accountHealthCheck(done, retries = 2) {
  const time = process.hrtime();
  const data = { up: false };

  try {
    const response = await got(`https://account.${process.env.PORTAL_DOMAIN}/health`, { responseType: "json" });

    data.statusCode = response.statusCode;
    data.response = response.body;
    data.up = response.body.dbAlive === true;
    data.ip = response.ip;
  } catch (error) {
    data.statusCode = error?.response?.statusCode || error.statusCode || error.status;
    data.errorMessage = error.message;
    data.errorResponseContent = getResponseContent(error.response);
    data.ip = error?.response?.ip ?? null;
  }

  // db checks can be a false negative due to slow network, retry to make sure it is actually down
  if (data.up === false && retries > 0) {
    setTimeout(() => accountHealthCheck(done, retries - 1), 3000); // delay 3 seconds and retry
  } else {
    done({ name: "accounts", time: calculateElapsedTime(time), ...data });
  }
}

// blockerHealthCheck returns the result of blocker container health endpoint
async function blockerHealthCheck(done, retries = 2) {
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
    data.statusCode = error?.response?.statusCode || error.statusCode || error.status;
    data.errorMessage = error.message;
    data.errorResponseContent = getResponseContent(error.response);
  }

  // db checks can be a false negative due to slow network, retry to make sure it is actually down
  if (data.up === false && retries > 0) {
    setTimeout(() => blockerHealthCheck(done, retries - 1), 3000); // delay 3 seconds and retry
  } else {
    done({ name: "blocker", time: calculateElapsedTime(time), ...data });
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
    data.statusCode = error?.response?.statusCode || error.statusCode || error.status;
    data.errorMessage = error.message;
    data.errorResponseContent = getResponseContent(error.response);
    data.ip = error?.response?.ip ?? null;
  }

  return { name, time: calculateElapsedTime(time), ...data };
}

const checks = [
  skydConfigCheck,
  skydWorkersCooldownCheck,
  uploadCheck,
  websiteCheck,
  downloadSkylinkCheck,
  downloadResolverSkylinkCheck,
  skylinkSubdomainCheck,
  handshakeSubdomainCheck,
  registryWriteAndReadCheck,
  directServerApiAccessCheck,
];

if (process.env.ACCOUNTS_ENABLED === "true") {
  checks.push(accountHealthCheck, accountWebsiteCheck);
}

if (isPortalModuleEnabled(MODULE_BLOCKER)) {
  checks.push(blockerHealthCheck);
}

module.exports = checks;
