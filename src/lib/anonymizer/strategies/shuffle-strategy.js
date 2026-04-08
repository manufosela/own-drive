/**
 * Shuffle (Fisher-Yates) anonymization strategy.
 * Redistributes values within a column so no row keeps its original value.
 *
 * @module anonymizer/strategies/shuffle-strategy
 */

/**
 * Shuffle an array of column values using Fisher-Yates algorithm.
 *
 * @param {Array<string|null>} values - Column values to shuffle
 * @returns {Array<string|null>} Shuffled values
 */
export function shuffleValues(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
