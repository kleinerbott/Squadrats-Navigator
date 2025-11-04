import { optimizeSquare } from './optimizer.js';

/*  Leaflet Map */
const map = L.map('map').setView([51.7,8.3],10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);


/* Data Containers */
const visitedLayer = L.layerGroup().addTo(map);
const proposedLayer = L.layerGroup().addTo(map);
let LAT_STEP, LON_STEP, originLat, originLon;
let visitedSet = new Set();
let baseSquare = null;

// KML Auswahl initialisieren
fetch('/api/kmlfiles').then(r=>r.json()).then(files=>{
  const sel=document.getElementById('kmlSelect');
  files.forEach(f=>{
    const opt=document.createElement('option');
    opt.value=f; opt.textContent=f; sel.appendChild(opt);
  });
  if(files.length>0) loadKml(files[0]);
  sel.addEventListener('change',()=>loadKml(sel.value));
});

function loadKml(filename){
  visitedLayer.clearLayers(); proposedLayer.clearLayers();
  const layer = omnivore.kml(`/data/${filename}`);
  layer.on('ready',()=>{

    const features = [];
    const allPolygons = []; // All polygons including ubersquadrats
    const candidates = [];

    layer.eachLayer(l=>{
      if(l.setStyle) l.setStyle({fillColor:'#00ff00',color:'#007700',fillOpacity:0.3});

      const featureName = l.feature?.properties?.name?.toLowerCase() || '';
      const isUbersquadrat = featureName.includes('ubersquadrat') && !featureName.includes('ubersquadratinho');
      const isUbersquadratinho = featureName.includes('ubersquadratinho') || featureName.includes('squadratinho');

      // Skip ubersquadratinho features completely
      if (isUbersquadratinho) {
        return;
      }

      if(l.feature?.geometry){
        const geometry = l.feature.geometry;

        // Handle different geometry types
        let polygonsToProcess = [];

        if (geometry.type === 'Polygon') {
            polygonsToProcess.push(geometry.coordinates[0]);
        } else if (geometry.type === 'MultiPolygon') {
            // Extract all polygons from MultiPolygon
            geometry.coordinates.forEach(polyCoords => {
              polygonsToProcess.push(polyCoords[0]); // outer ring
            });
        } else if (geometry.type === 'GeometryCollection') {
            // Extract polygons from GeometryCollection
            geometry.geometries.forEach(geom => {
              if (geom.type === 'Polygon') {
                polygonsToProcess.push(geom.coordinates[0]);
              } else if (geom.type === 'MultiPolygon') {
                geom.coordinates.forEach(polyCoords => {
                  polygonsToProcess.push(polyCoords[0]);
                });
              }
            });
        } else if (geometry.type === 'Point') {
            return; // Skip points
        } else {
            return;
        }


        // Process each polygon
        polygonsToProcess.forEach(coordsList => {
          const latlon = coordsList.map(c=>[c[1],c[0]]); // [lon, lat] zu [lat, lon] tauschen

          // Add all polygons to allPolygons
          allPolygons.push({coords:latlon});

          if(isUbersquadrat){
            candidates.push({name:l.feature.properties.name, coords:latlon});
          } else {
            // Only add non-ubersquadrat polygons to features for step calculation
            features.push({coords:latlon});

            // Collect actual square coordinates to determine grid alignment
            if (!isUbersquadrat) {
              const lats = latlon.map(p => p[0]);
              const lons = latlon.map(p => p[1]);
              const minLat = Math.min(...lats);
              const minLon = Math.min(...lons);
              const maxLat = Math.max(...lats);
              const maxLon = Math.max(...lons);

              // Store min coordinates to help determine grid origin
              if (!window.actualSquareCorners) {
                window.actualSquareCorners = [];
              }
              window.actualSquareCorners.push({ minLat, minLon, maxLat, maxLon });

            }
          }
        });
      }
    });


    // --- STEP 1: Find übersquadrat first ---
    let overCoords = null;

    if (candidates.length>0){
      // Nimm größtes gefundene Übersquadrat-Kandidat
      let maxArea=0;
      for (const c of candidates){
        const lats=c.coords.map(p=>p[0]), lons=c.coords.map(p=>p[1]);
        const area=(Math.max(...lats)-Math.min(...lats))*(Math.max(...lons)-Math.min(...lons));

        if(area>maxArea){
          maxArea=area;
          overCoords=c.coords;
        }
      }
    } else {
      // Fallback: größtes Polygon nach Fläche
      let maxArea=0;
      for (const f of features){
        const lats=f.coords.map(p=>p[0]), lons=f.coords.map(p=>p[1]);
        const area=(Math.max(...lats)-Math.min(...lats))*(Math.max(...lons)-Math.min(...lons));
        if(area>maxArea){
          maxArea=area;
          overCoords=f.coords;
        }
      }
    }

    if(!overCoords){ alert("Kein Übersquadrat gefunden."); return; }

    // --- STEP 2: Calculate grid steps from all non-ubersquadrat polygons ---
    if (features.length === 0) {
      alert('Keine Polygone im KML gefunden');
      return;
    }

    // === NEW APPROACH: Build everything from ubersquadrat coordinates ===
    console.log('=== Building grid from ubersquadrat KML coordinates ===');

    // Extract ubersquadrat polygon vertices - these define the grid
    const uberPolygon = candidates[0].coords;
    const allLats = [...new Set(uberPolygon.map(p => p[0]))].sort((a, b) => a - b);
    const allLons = [...new Set(uberPolygon.map(p => p[1]))].sort((a, b) => a - b);

    console.log('Ubersquadrat has', allLats.length, 'unique latitudes and', allLons.length, 'unique longitudes');

    // Calculate grid steps from the SMALL VISITED SQUARES (not ubersquadrat)
    // The ubersquadrat has holes/gaps, so we can't use its vertices directly
    console.log('Calculating grid steps from', window.actualSquareCorners?.length || 0, 'small squares...');

    if (!window.actualSquareCorners || window.actualSquareCorners.length === 0) {
      alert('No small squares found to calculate grid steps!');
      return;
    }

    // Get sizes from actual small squares
    const latSizes = window.actualSquareCorners.map(sq => sq.maxLat - sq.minLat);
    const lonSizes = window.actualSquareCorners.map(sq => sq.maxLon - sq.minLon);

    // Filter to get single-square sizes (ignore double-width squares)
    const singleLatSizes = latSizes.filter(s => s < 0.03); // Less than double size
    const singleLonSizes = lonSizes.filter(s => s < 0.03);

    // Use the most common (mode) or minimum size
    LAT_STEP = Math.min(...singleLatSizes);
    LON_STEP = Math.min(...singleLonSizes);

    console.log('Grid steps from small squares:', 'LAT=', LAT_STEP.toFixed(7), 'LON=', LON_STEP.toFixed(7));

    // Use first coordinate as reference, calculate origin via modulo
    originLat = allLats[0] % LAT_STEP;
    originLon = allLons[0] % LON_STEP;
    console.log('Grid origin:', originLat.toFixed(7), originLon.toFixed(7));

    // Convert ubersquadrat bounds to grid indices
    const uberMinI = Math.round((allLats[0] - originLat) / LAT_STEP);
    const uberMaxI = Math.round((allLats[allLats.length - 1] - originLat) / LAT_STEP) - 1;
    const uberMinJ = Math.round((allLons[0] - originLon) / LON_STEP);
    const uberMaxJ = Math.round((allLons[allLons.length - 1] - originLon) / LON_STEP) - 1;

    console.log('Ubersquadrat grid: i=[', uberMinI, 'to', uberMaxI, '], j=[', uberMinJ, 'to', uberMaxJ, ']');
    console.log('Size:', (uberMaxI - uberMinI + 1), 'x', (uberMaxJ - uberMinJ + 1), '=', (uberMaxI - uberMinI + 1) * (uberMaxJ - uberMinJ + 1), 'squares');

    // --- Build visited set from ALL actual polygons with centroid matching ---
    visitedSet = new Set();

    console.log('Checking', allPolygons.length, 'polygons to build visited set...');

    allPolygons.forEach((poly, idx) => {
      // Skip large polygons (ubersquadrat itself)
      if (poly.coords.length > 100) {
        console.log('Skipping large polygon with', poly.coords.length, 'vertices');
        return;
      }

      // Calculate centroid
      const lats = poly.coords.map(p => p[0]);
      const lons = poly.coords.map(p => p[1]);
      const centroidLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const centroidLon = (Math.min(...lons) + Math.max(...lons)) / 2;

      // Convert to grid index (with tolerance - round to nearest)
      const i = Math.round((centroidLat - originLat) / LAT_STEP);
      const j = Math.round((centroidLon - originLon) / LON_STEP);

      visitedSet.add(`${i},${j}`);

      if (idx < 5) {
        console.log('Polygon', idx, ': centroid [', centroidLat.toFixed(6), ',', centroidLon.toFixed(6), '] -> grid [', i, ',', j, ']');
      }
    });

    console.log('Visited set:', visitedSet.size, 'unique grid squares from', allPolygons.length, 'polygons');
    console.log('Sample:', Array.from(visitedSet).slice(0, 10));

    // Übersquadrat-Grenzen in Grid-Koordinaten umrechnen
    const lats = overCoords.map(c=>c[0]);
    const lons = overCoords.map(c=>c[1]);
    const uberMinLat = Math.min(...lats);
    const uberMaxLat = Math.max(...lats);
    const uberMinLon = Math.min(...lons);
    const uberMaxLon = Math.max(...lons);

    // Use the same grid coordinates we calculated earlier for the visited set
    baseSquare = {minI: uberMinI, maxI: uberMaxI, minJ: uberMinJ, maxJ: uberMaxJ};
    console.log("Base square grid coords:", baseSquare);

    // Draw the blue rectangle using grid-aligned coordinates
    // This helps visualize whether our grid is correctly aligned
    const gridAlignedMinLat = originLat + uberMinI * LAT_STEP;
    const gridAlignedMaxLat = originLat + (uberMaxI + 1.47) * LAT_STEP;
    const gridAlignedMinLon = originLon + uberMinJ * LON_STEP;
    const gridAlignedMaxLon = originLon + (uberMaxJ + 1) * LON_STEP;

    console.log('Blue rectangle grid-aligned coords:',
      '[', gridAlignedMinLat.toFixed(6), ',', gridAlignedMinLon.toFixed(6), '] to',
      '[', gridAlignedMaxLat.toFixed(6), ',', gridAlignedMaxLon.toFixed(6), ']');
    console.log('vs actual ubersquadrat bounds:',
      '[', uberMinLat.toFixed(6), ',', uberMinLon.toFixed(6), '] to',
      '[', uberMaxLat.toFixed(6), ',', uberMaxLon.toFixed(6), ']');

    L.rectangle([[gridAlignedMinLat, gridAlignedMinLon],[gridAlignedMaxLat, gridAlignedMaxLon]], {color:'#0000ff',fillColor:'#0000ff',fillOpacity:0.15}).addTo(visitedLayer);

    map.fitBounds([[uberMinLat, uberMinLon],[uberMaxLat, uberMaxLon]]);
  });

  layer.addTo(visitedLayer);
}


document.getElementById('optimizeBtn').addEventListener('click',()=>{
  if(!baseSquare){ alert('Noch kein Übersquadrat erkannt'); return; }
  const n=parseInt(document.getElementById('numAdd').value);
  const dir=document.getElementById('direction').value;
  const newRects=optimizeSquare(baseSquare,n,dir,visitedSet,LAT_STEP,LON_STEP,originLat,originLon);
  proposedLayer.clearLayers();
  newRects.forEach(r=>{
    L.rectangle(r,{color:'#ffd700',fillColor:'#ffd700',fillOpacity:0.8}).addTo(proposedLayer);
  });
});
