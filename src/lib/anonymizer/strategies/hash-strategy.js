/**
 * Hash anonymization strategy.
 * Produces consistent SHA-256 hashes (truncated) for any value.
 *
 * @module anonymizer/strategies/hash-strategy
 */

import { createHash } from 'node:crypto';

/**
 * Hash a value using SHA-256, returning a truncated hex string.
 * Same input always produces same output (deterministic).
 *
 * @param {string} value
 * @param {number} [length=12] - Hex characters to keep
 * @returns {string}
 */
export function hashValue(value, length = 12) {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}
