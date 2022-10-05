export const ipCheckService = "whatismyip.akamai.com";
export const ipRegex = new RegExp(
  `^(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)){3}$`
);

/**
 * Get the time between start and now in milliseconds
 */
export function calculateElapsedTime(start) {
  const diff = process.hrtime(start);

  return Math.round((diff[0] * 1e9 + diff[1]) / 1e6); // msec
}

/**
 * Get the ISO string with yesterday's date set (- 24 hours)
 */
export function getYesterdayISOString() {
  const date = new Date();

  date.setDate(date.getDate() - 1);

  return date.toISOString();
}

/**
 * Get response from response object if available
 */
export function getResponseContent(response) {
  try {
    return JSON.parse(response?.body || response?.text);
  } catch {
    return response?.body || response?.text;
  }
}

/**
 * Ensures that the object serializes to JSON properly
 */
export function ensureValidJSON(object) {
  const replacer = (key, value) => (value === undefined ? "--undefined--" : value);
  const stringified = JSON.stringify(object, replacer);

  return JSON.parse(stringified);
}

/**
 * isPortalModuleEnabled returns true if the given module is enabled
 */
export function isPortalModuleEnabled(module) {
  return Boolean(process.env.PORTAL_MODULES) && process.env.PORTAL_MODULES.indexOf(module) !== -1;
}

/**
 * Compute and generate a message indicating a disabled server. Server is disabled when either:
 * - disable reason is set manually (non empty)
 * - DENY_PUBLIC_ACCESS env variable is set to true (server on takedown)
 */
export function getDisabledServerReason(manualDisabledReason) {
  // check if a flag that indicates that server should disable public traffic is enabled
  if (process.env.DENY_PUBLIC_ACCESS === "true") {
    const accessDeniedReason = "Server public access denied"; // generic reason message

    // include manual disable reason if server has been manually disabled
    return manualDisabledReason ? `${manualDisabledReason} & ${accessDeniedReason}` : accessDeniedReason;
  }

  return manualDisabledReason;
}

/**
 * Parse header string, to check whether it contains an object, return the header string otherwise
 */
export function parseHeaderString(header) {
  try {
    return JSON.parse(header);
  } catch {
    return header;
  }
}

/**
 * Get response data from axios error response object
 */
export function getResponseErrorData(error) {
  return {
    // try response object first, otherwise use statusCode or status props
    statusCode: error.response?.statusCode ?? error.statusCode ?? error.status,
    // error message is always available
    errorMessage: error.message,
    // check error response body for additional error message context
    errorResponseContent: getResponseContent(error.response),
    // ip is not always available when no response was received
    ip: error?.response?.ip ?? null,
  };
}
