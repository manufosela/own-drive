/**
 * Anonymization engine.
 * Applies configurable strategies per column to anonymize tabular data.
 *
 * @module anonymizer/anonymizer-engine
 */

import { fakeValue } from './strategies/fake-strategy.js';
import { shuffleValues } from './strategies/shuffle-strategy.js';
import { maskValue } from './strategies/mask-strategy.js';
import { hashValue } from './strategies/hash-strategy.js';

/** Available anonymization strategies */
export const STRATEGIES = ['fake', 'shuffle', 'mask', 'hash', 'preserve'];

/**
 * @typedef {object} ColumnConfig
 * @property {string} name
 * @property {'fake'|'shuffle'|'mask'|'hash'|'preserve'} strategy
 * @property {string} [fakerType] - Required when strategy is 'fake'
 */

/**
 * Anonymize tabular data according to per-column configuration.
 *
 * @param {Array<Array<string|null>>} rows - Input rows
 * @param {Array<{name: string}>} columns - Column definitions
 * @param {ColumnConfig[]} config - Per-column anonymization config
 * @param {object} [options]
 * @param {Map<string, Map<string, string>>} [options.consistencyMap] - Cross-table consistency map (colName → originalValue → fakeValue)
 * @returns {Array<Array<string|null>>} Anonymized rows
 */
export function anonymize(rows, columns, config, options = {}) {
  const { consistencyMap } = options;
  const colIndexMap = new Map(columns.map((c, i) => [c.name, i]));

  // Build a config map by column index
  const configByIndex = new Map();
  for (const cfg of config) {
    const idx = colIndexMap.get(cfg.name);
    if (idx !== undefined) {
      configByIndex.set(idx, cfg);
    }
  }

  // Deep-copy rows
  const result = rows.map((row) => [...row]);

  // Pre-process shuffle strategy: collect and shuffle column values
  for (const [colIdx, cfg] of configByIndex) {
    if (cfg.strategy === 'shuffle') {
      const colValues = rows.map((row) => row[colIdx]);
      const shuffled = shuffleValues(colValues);
      for (let i = 0; i < result.length; i++) {
        result[i][colIdx] = shuffled[i];
      }
    }
  }

  // Process each row for non-shuffle strategies
  for (let rowIdx = 0; rowIdx < result.length; rowIdx++) {
    for (const [colIdx, cfg] of configByIndex) {
      if (cfg.strategy === 'preserve' || cfg.strategy === 'shuffle') continue;

      const originalValue = rows[rowIdx][colIdx];

      // Preserve nulls
      if (originalValue === null || originalValue === undefined) {
        result[rowIdx][colIdx] = null;
        continue;
      }

      result[rowIdx][colIdx] = applyStrategy(cfg, originalValue, consistencyMap);
    }
  }

  return result;
}

/**
 * Apply a single strategy to a value.
 *
 * @param {ColumnConfig} cfg
 * @param {string} value
 * @param {Map<string, Map<string, string>>} [consistencyMap]
 * @returns {string}
 */
function applyStrategy(cfg, value, consistencyMap) {
  const { strategy, name: colName, fakerType } = cfg;

  // Check consistency map first
  if (consistencyMap && strategy === 'fake') {
    if (!consistencyMap.has(colName)) {
      consistencyMap.set(colName, new Map());
    }
    const colMap = consistencyMap.get(colName);
    if (colMap.has(value)) {
      return colMap.get(value);
    }
    const faked = fakeValue(fakerType || 'text');
    colMap.set(value, faked);
    return faked;
  }

  switch (strategy) {
    case 'fake':
      return fakeValue(fakerType || 'text');
    case 'mask':
      return maskValue(value);
    case 'hash':
      return hashValue(value);
    default:
      return value;
  }
}
