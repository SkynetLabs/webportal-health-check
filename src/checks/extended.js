const got = require("got");
const hasha = require("hasha");
const { detailedDiff } = require("deep-object-diff");
const { isEqual } = require("lodash");
const { calculateElapsedTime, ensureValidJSON, getResponseContent, parseHeaderString } = require("../utils");
const extendedChecks = require("../fixtures/extendedChecks.json");

/**
 *
 * @param {string} name check names
 * @param {object} expected expected data (metadata, headers, etc.)
 * @param {object} config config object containing optional request parameters
 */
async function executeExtendedCheck(name, expected, config = {}) {
  const time = process.hrtime();
  const details = { name, skylink: expected.skylink };

  try {
    const query = `https://${process.env.PORTAL_DOMAIN}/${expected.skylink}`;
    const response = await got[config.method ?? "get"](query, {
      followRedirect: config.followRedirect ?? true,
      headers: { "Skynet-Api-Key": process.env.ACCOUNTS_TEST_USER_API_KEY },
    });

    // prepare entry report object
    const entry = { ...details, up: true, statusCode: response.statusCode, time: calculateElapsedTime(time) };

    // prepare additional info object for any mismatch reposts
    const info = {};

    // compare status codes if defined in the expected response object
    if (expected.statusCode && expected.statusCode !== response.statusCode) {
      entry.up = false;
      info.statusCode = { expected: expected.statusCode, current: response.statusCode };
    }

    // compare body hash if defined in the expected response object
    if (expected.bodyHash) {
      const currentBodyHash = hasha(response.rawBody, { algorithm: "sha1" });

      if (currentBodyHash !== expected.bodyHash) {
        entry.up = false;
        info.bodyHash = { expected: expected.bodyHash, current: currentBodyHash };
      }
    }

    // compare headers if defined in the expected response object
    if (expected.headers) {
      Object.entries(expected.headers).forEach(([headerName, expectedHeader]) => {
        const currentHeader = parseHeaderString(response.headers[headerName]);

        if (!isEqual(currentHeader, expectedHeader)) {
          entry.up = false;
          info.headers = info.headers ?? {};

          // special deep diff mode report for headers containing valid json objects
          if (typeof currentHeader === "object") {
            info.headers[headerName] = ensureValidJSON(detailedDiff(expectedHeader, currentHeader));
          } else {
            info.headers[headerName] = { expected: expectedHeader, current: currentHeader };
          }
        }
      });
    }

    // if metadata comparison is expected and skylink is provided, fetch metadata
    // in separate request and compare it with expected metadata
    if (expected.metadata && expected.skylink) {
      const url = `https://${process.env.PORTAL_DOMAIN}/skynet/metadata/${expected.skylink}`;
      try {
        const metadata = await got(url, {
          headers: { "Skynet-Api-Key": process.env.ACCOUNTS_TEST_USER_API_KEY },
        }).json();

        // deep compare requested metadata with expected metadata
        if (!isEqual(expected.metadata, metadata)) {
          entry.up = false;

          // report metadata diff on mismatch
          info.metadata = { url, diff: ensureValidJSON(detailedDiff(expected.metadata, metadata)) };
        }
      } catch (error) {
        entry.up = false;
        info.metadata = {
          url,
          ip: error?.response?.ip ?? null,
          statusCode: error?.response?.statusCode || error.statusCode || error.status,
          errorMessage: error.message,
          errorResponseContent: getResponseContent(error.response),
        };
      }
    }

    // attach info only if it exists
    if (Object.keys(info).length) {
      entry.info = info;
    }

    return entry; // return the entry information
  } catch (error) {
    return {
      ...details,
      up: false,
      ip: error?.response?.ip ?? null,
      statusCode: error?.response?.statusCode || error.statusCode || error.status,
      errorMessage: error.message,
      errorResponseContent: getResponseContent(error.response),
      time: calculateElapsedTime(time),
    };
  }
}

module.exports = extendedChecks.map((extendedCheck) => {
  return () => executeExtendedCheck(extendedCheck.name, extendedCheck.data, extendedCheck.config);
});
