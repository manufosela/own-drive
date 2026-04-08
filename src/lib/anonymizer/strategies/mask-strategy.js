/**
 * Masking anonymization strategy.
 * Partially obscures values while preserving some characters for recognition.
 *
 * @module anonymizer/strategies/mask-strategy
 */

/**
 * Mask a value by replacing middle characters with asterisks.
 * Preserves first 2 and last 1 characters for short values,
 * first 3 and last 2 for longer values.
 *
 * @param {string} value
 * @returns {string}
 */
export function maskValue(value) {
  if (!value || value.length <= 3) {
    return '***';
  }

  if (value.length <= 6) {
    return value.slice(0, 2) + '***' + value.slice(-1);
  }

  return value.slice(0, 3) + '***' + value.slice(-2);
}
