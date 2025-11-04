export function estimateGridStep(allPolygons) {
  const latSizes = [], lonSizes = [];

  for (const p of allPolygons) {
    const lats = p.coords.map(c => c[0]);
    const lons = p.coords.map(c => c[1]);
    const latSize = Math.max(...lats) - Math.min(...lats);
    const lonSize = Math.max(...lons) - Math.min(...lons);

    // Filter out very large polygons (likely outer boundaries with holes)
    // Keep only reasonable grid-sized squares (< 0.5 degrees)
    if (latSize < 0.5 && lonSize < 0.5) {
      latSizes.push(latSize);
      lonSizes.push(lonSize);
    }
  }


  // Mode with larger tolerance to handle floating point variations
  function mode(arr, tol = 0.001) {
    const counts = new Map();
    for (const v of arr) {
      const key = Math.round(v / tol) * tol;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    // Sort by count (descending), then by value (ascending) to prefer smaller values in ties
    const sorted = Array.from(counts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]; // Sort by count
      return a[0] - b[0]; // If tied, prefer smaller value
    });


    // Find the smallest value that appears with significant frequency
    // This helps avoid picking double-squares (2x grid size) over single squares
    if (sorted.length === 0) return null;

    const maxCount = sorted[0][1];
    const threshold = Math.max(3, maxCount * 0.5); // At least 3 occurrences or 50% of max

    // Collect all values that meet the threshold
    const candidates = sorted.filter(([value, count]) => count >= threshold);

    if (candidates.length === 0) return sorted[0][0];

    // Sort candidates by value (ascending) to get the smallest
    candidates.sort((a, b) => a[0] - b[0]);

    const selected = candidates[0];


    return selected[0];
  }

  const latStep = mode(latSizes) || 0.014;
  const lonStep = mode(lonSizes) || 0.022;


  return {
    LAT_STEP: latStep,
    LON_STEP: lonStep
  };
}
