const crypto = require("crypto");

const HASH_ALGORITHM = "sha256";
const HASH_ITERATIONS = 210000;
const HASH_KEY_LENGTH = 32;
const HASH_PREFIX = "pbkdf2";

function hashPassword(password) {
  if (!password || typeof password !== "string") {
    throw new Error("Senha obrigatoria para gerar hash.");
  }

  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM)
    .toString("base64url");

  return [HASH_PREFIX, HASH_ALGORITHM, HASH_ITERATIONS, salt, hash].join("$");
}

function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;

  const [prefix, algorithm, iterationsValue, salt, expectedHash] = storedHash.split("$");
  if (prefix !== HASH_PREFIX || !algorithm || !iterationsValue || !salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto
    .pbkdf2Sync(password, salt, Number(iterationsValue), HASH_KEY_LENGTH, algorithm)
    .toString("base64url");

  const actualBuffer = Buffer.from(actualHash);
  const expectedBuffer = Buffer.from(expectedHash);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

module.exports = {
  hashPassword,
  verifyPassword
};
