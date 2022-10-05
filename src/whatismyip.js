/**
 * Simple node script to request external ip of the current machine and prints it to the console.
 * It runs without any third party dependencies so can be used without installing node_modules.
 *
 * Execution example: node src/whatismyip.js
 */

const http = require("node:http");
const { ipCheckService, ipRegex } = require("./utils");

const request = http.request({ host: ipCheckService }, (response) => {
  response.on("data", (data) => {
    if (ipRegex.test(data)) {
      process.stdout.write(data);
    } else {
      throw new Error(`${ipCheckService} responded with invalid ip: "${data}"`);
    }
  });
});

request.on("error", (error) => {
  throw error; // throw error to exit with code 1
});

request.end();
