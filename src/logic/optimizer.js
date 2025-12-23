/**
 * Optimizer Wrapper
 *
 * Entry point for square optimization - calls strategic optimizer.
 */

import { optimizeStrategic } from './strategic-optimizer.js';

/**
 * Main optimization entry point
 *
 * @param {Object} base - Übersquadrat bounds {minI, maxI, minJ, maxJ}
 * @param {number} targetNew - Number of new squares to recommend
 * @param {Array} direction - Selected directions ['N', 'S', 'E', 'W']
 * @param {Set} visitedSet - Set of "i,j" visited squares
 * @param {number} LAT_STEP - Grid cell height (degrees)
 * @param {number} LON_STEP - Grid cell width (degrees)
 * @param {number} originLat - Grid origin latitude
 * @param {number} originLon - Grid origin longitude
 * @param {string} optimizationMode - 'balanced', 'edge', or 'holes'
 * @param {number} maxHoleSize - Maximum hole size to consider (1-20)
 * @returns {Object} {rectangles, metadata} - Array of rectangle bounds and metadata
 */
export function optimizeSquare(
  base,
  targetNew,
  direction,
  visitedSet,
  LAT_STEP,
  LON_STEP,
  originLat,
  originLon,
  optimizationMode = 'balanced',
  maxHoleSize = 5
) {
  return optimizeStrategic(
    base,
    targetNew,
    direction,
    visitedSet,
    LAT_STEP,
    LON_STEP,
    originLat,
    originLon,
    optimizationMode,
    maxHoleSize
  );
}
