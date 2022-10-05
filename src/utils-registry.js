/**
 * MAINTAINER NOTE
 *
 * Most of this code has been ported from skynet-js to decouple the skynet-js sdk from health checks
 * and prepare this repository to migration to es modules (skynet-js is not compatible with es modules).
 *
 * source: https://github.com/SkynetLabs/skynet-js/blob/master/src/registry.ts
 */

import { randomBytes } from "node:crypto";
import blakejs from "blakejs";
import got from "got";
import pbkdf2Hmac from "pbkdf2-hmac";
import tweetnacl from "tweetnacl";

const { blake2bFinal, blake2bInit, blake2bUpdate } = blakejs;
const { sign } = tweetnacl;

/**
 * Converts a hex encoded string to a uint8 array.
 *
 * @param str - The string to convert.
 * @returns - The uint8 array.
 * @throws - Will throw if the input is not a valid hex-encoded string or is an empty string.
 */
function hexToUint8Array(str) {
  return new Uint8Array(str.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
}

/**
 * Converts the given number into a uint8 array. Uses little-endian encoding.
 *
 * @param num - Number to encode.
 * @returns - Number encoded as a byte array.
 */
function encodeNumber(num) {
  const encoded = new Uint8Array(8);
  for (let index = 0; index < encoded.length; index++) {
    const byte = num & 0xff;
    encoded[index] = byte;
    num = num >> 8;
  }
  return encoded;
}

/**
 * Converts a UTF-8 string to a uint8 array containing valid UTF-8 bytes.
 *
 * @param str - The string to convert.
 * @returns - The uint8 array.
 * @throws - Will throw if the input is not a string.
 */
function stringToUint8ArrayUtf8(str) {
  return Uint8Array.from(Buffer.from(str, "utf-8"));
}

/**
 * Encodes the given UTF-8 string into a uint8 array containing the string length and the string.
 *
 * @param str - String to encode.
 * @returns - String encoded as a byte array.
 */
function encodeUtf8String(str) {
  const byteArray = stringToUint8ArrayUtf8(str);
  const encoded = new Uint8Array(8 + byteArray.length);
  encoded.set(encodeNumber(byteArray.length));
  encoded.set(byteArray, 8);
  return encoded;
}

/**
 * Hash the given data key.
 *
 * @param dataKey - Data key to hash.
 * @returns - Hash of the data key.
 */
function hashDataKey(dataKey) {
  return hashAll(encodeUtf8String(dataKey));
}

/**
 * Encodes the uint8array, prefixed by its length.
 *
 * @param bytes - The input array.
 * @returns - The encoded byte array.
 */
function encodePrefixedBytes(bytes) {
  const len = bytes.length;
  const buf = new ArrayBuffer(8 + len);
  const view = new DataView(buf);

  // Sia uses setUint64 which is unavailable in JS.
  view.setUint32(0, len, true);
  const uint8Bytes = new Uint8Array(buf);
  uint8Bytes.set(bytes, 8);

  return uint8Bytes;
}

/**
 * Takes all given arguments and hashes them.
 *
 * @param parts - Byte arrays to hash.
 * @returns - The final hash as a byte array.
 */
function hashAll(...parts) {
  const hasher = blake2bInit(32);
  parts.forEach((arg) => blake2bUpdate(hasher, arg));
  return blake2bFinal(hasher);
}

/**
 * Encodes the given bigint into a uint8 array. Uses little-endian encoding.
 *
 * @param int - Bigint to encode.
 * @returns - Bigint encoded as a byte array.
 * @throws - Will throw if the int does not fit in 64 bits.
 */
function encodeBigintAsUint64(int) {
  const encoded = new Uint8Array(8);
  for (let index = 0; index < encoded.length; index++) {
    const byte = int & BigInt(0xff);
    encoded[index] = Number(byte);
    int = int >> BigInt(8);
  }
  return encoded;
}

/**
 * Hashes the given registry entry.
 *
 * @param registryEntry - Registry entry to hash.
 * @param hashedDataKeyHex - Whether the data key is already hashed and in hex format. If not, we hash the data key.
 * @returns - Hash of the registry entry.
 */
function hashRegistryEntry(registryEntry, hashedDataKeyHex) {
  let dataKeyBytes;
  if (hashedDataKeyHex) {
    dataKeyBytes = hexToUint8Array(registryEntry.dataKey);
  } else {
    dataKeyBytes = hashDataKey(registryEntry.dataKey);
  }

  const dataBytes = encodePrefixedBytes(registryEntry.data);

  return hashAll(dataKeyBytes, dataBytes, encodeBigintAsUint64(registryEntry.revision));
}

/**
 * Generates key pair and seed for signing skynet registry requests
 */
export async function genKeyPairAndSeed() {
  const seed = randomBytes(64).toString("hex");
  const derivedKey = await pbkdf2Hmac(seed, "", 1000, 32, "SHA-256");
  const { publicKey, secretKey } = sign.keyPair.fromSeed(new Uint8Array(derivedKey));

  return {
    seed,
    publicKey: Buffer.from(publicKey).toString("hex"),
    privateKey: Buffer.from(secretKey).toString("hex"),
  };
}

/**
 * Convert a byte array to a hex string.
 *
 * @param byteArray - The byte array to convert.
 * @returns - The hex string.
 * @see {@link https://stackoverflow.com/a/44608819|Stack Overflow}
 */
function toHexString(byteArray) {
  let s = "";
  byteArray.forEach(function (byte) {
    s += ("0" + (byte & 0xff).toString(16)).slice(-2);
  });
  return s;
}

/**
 * Sets the registry entry.
 *
 * @param privateKey - The user private key.
 * @param publicKey - The user public key.
 * @param entry - The entry to set.
 */
export async function setRegistryEntry(privateKey, publicKey, entry) {
  const signature = sign.detached(hashRegistryEntry(entry, false), hexToUint8Array(privateKey));
  const json = {
    publickey: {
      algorithm: "ed25519",
      key: Array.from(hexToUint8Array(publicKey)),
    },
    datakey: toHexString(hashDataKey(entry.dataKey)),
    // Set the revision as a string here. The value may be up to 64 bits and the limit for a JS number is 53 bits.
    // We remove the quotes later in transformRequest, as JSON does support 64 bit numbers.
    revision: Number(entry.revision),
    data: Array.from(entry.data),
    signature: Array.from(signature),
  };

  // send read request to /skynet/registry endpoint
  const endpoint = `https://${process.env.PORTAL_DOMAIN}/skynet/registry`;
  await got.post(endpoint, {
    headers: { "Skynet-Api-Key": process.env.ACCOUNTS_TEST_USER_API_KEY },
    json,
  });
}

/**
 * Gets the registry entry corresponding to the publicKey and dataKey.
 *
 * @param publicKey - The user public key.
 * @param dataKey - The key of the data to fetch for the given user.
 */
export async function getRegistryEntry(publicKey, dataKey) {
  // send read request to /skynet/registry endpoint
  const endpoint = `https://${process.env.PORTAL_DOMAIN}/skynet/registry`;
  const { body: entry } = await got(
    `${endpoint}?publickey=ed25519%3A${publicKey}&datakey=${toHexString(hashDataKey(dataKey))}&timeout=5`,
    {
      responseType: "json",
      headers: { "Skynet-Api-Key": process.env.ACCOUNTS_TEST_USER_API_KEY },
    }
  );

  // return entry with skynet-js schema
  return { dataKey, data: hexToUint8Array(entry.data), revision: BigInt(entry.revision) };
}
