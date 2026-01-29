<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import L from 'leaflet';
import { useAppStore } from '../stores/appStore';
import { storeToRefs } from 'pinia';
import { CONFIG } from '../logic/config';
import { visualizeUbersquadrat, drawGridLines } from '../logic/grid';

const store = useAppStore();
const { routing } = storeToRefs(store);

const mapContainer = ref(null);

let map = null;
const layers = {
  visited: null,
  proposed: null,
  grid: null,
  route: null
};

onMounted(() => {
  initializeMap();
});

onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
});


function initializeMap() {
  map = L.map(mapContainer.value, {
    // Touch interaction settings for mobile
    tap: true,                
    tapTolerance: 15,         
    touchZoom: true,          
    bounceAtZoomLimits: true, 
    dragging: true,           
    zoomControl: true         
  }).setView([51.7, 8.3], 10);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  layers.visited = L.layerGroup().addTo(map);
  layers.proposed = L.layerGroup().addTo(map);
  layers.grid = L.layerGroup().addTo(map);
  layers.route = L.layerGroup().addTo(map);

  map.on('click', handleMapClick);
}

/**
 * Handle map click for start point selection
 */
function handleMapClick(e) {
  if (routing.value.selectingStartPoint) {
    store.setStartPoint(e.latlng.lat, e.latlng.lng);

    layers.route.clearLayers();

    L.circleMarker([e.latlng.lat, e.latlng.lng], {
      radius: CONFIG.START_MARKER_RADIUS,
      fillColor: CONFIG.START_MARKER_COLOR,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(layers.route);
  }
}

watch(
  () => routing.value.selectingStartPoint,
  (selecting) => {
    if (map) {
      map.getContainer().style.cursor = selecting ? 'crosshair' : '';
    }
  }
);

function onKmlLoaded(data) {
  const { gridParams, bounds, kmlLayer } = data;

  layers.visited.clearLayers();
  layers.proposed.clearLayers();
  layers.grid.clearLayers();
  layers.route.clearLayers();

  if (kmlLayer) {
    kmlLayer.addTo(layers.visited);
  }

  visualizeUbersquadrat(gridParams.baseSquare, gridParams, layers.visited);

  drawGridLines(gridParams.baseSquare, gridParams, layers.grid);

  map.fitBounds([
    [bounds.minLat, bounds.minLon],
    [bounds.maxLat, bounds.maxLon]
  ]);
}

/**
 * Show proposed squares on map with score tooltips and popups
 * @param {Array} squares - Array of rectangle bounds
 * @param {Array} metadata - Array of metadata for each square
 * @param {Array} skippedIndices - Array of indices for skipped squares
 */
function showProposedSquares(squares, metadata = [], skippedIndices = []) {
  layers.proposed.clearLayers();

  squares.forEach((rectangle, index) => {
    const meta = metadata[index];
    const isSkipped = skippedIndices.includes(index);

    const rect = L.rectangle(rectangle, {
      color: isSkipped ? '#d32f2f' : CONFIG.PROPOSED_COLOR, 
      fillColor: isSkipped ? '#ffcdd2' : CONFIG.PROPOSED_COLOR, 
      fillOpacity: isSkipped ? 0.4 : CONFIG.PROPOSED_OPACITY,
      weight: isSkipped ? 3 : 2 
    });

    if (meta) {
      const tooltipText = isSkipped
        ? `#${meta.selectionOrder}: ÜBERSPRUNGEN (keine passenden Straßen)`
        : `#${meta.selectionOrder}: ${meta.score.toLocaleString()} points`;
      rect.bindTooltip(tooltipText, {
        permanent: false,
        direction: 'top'
      });

      const popupContent = isSkipped
        ? `<div style="color: #d32f2f; font-weight: bold;">Quadrat übersprungen</div><div style="margin-top: 8px;">Keine geeigneten Straßen für gewählten Fahrrad-Typ gefunden.</div>`
        : formatScorePopup(meta);
      rect.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'score-popup'
      });
    }

    rect.addTo(layers.proposed);
  });
}

function formatScorePopup(meta) {
  const {gridCoords, score, scoreBreakdown, layerDistance, selectionOrder, edge, hole} = meta;

  let html = `
    <div class="square-score-details">
      <h4>Square #${selectionOrder}</h4>
      <p><strong>Grid Position:</strong> (${gridCoords.i}, ${gridCoords.j})</p>
      <p><strong>Layer Distance:</strong> ${layerDistance}</p>
      ${edge ? `<p><strong>Edge:</strong> ${edge}</p>` : ''}
      ${hole ? `<p><strong>Hole:</strong> Size ${hole.size}</p>` : ''}

      <hr/>
      <h5>Total Score: ${score.toLocaleString()}</h5>

      <h5>Score Breakdown:</h5>
      <ul>
        <li>Base: ${scoreBreakdown.base}</li>
  `;

  html += `
      <li>Layer Distance: ${scoreBreakdown.layerScore >= 0 ? '+' : ''}${scoreBreakdown.layerScore.toLocaleString()}</li>
      <li>Edge Bonus: ${scoreBreakdown.edgeBonus >= 0 ? '+' : ''}${scoreBreakdown.edgeBonus.toLocaleString()}</li>
      <li>Hole Bonus: ${scoreBreakdown.holeBonus >= 0 ? '+' : ''}${scoreBreakdown.holeBonus.toLocaleString()}</li>
      <li>Adjacency: ${scoreBreakdown.adjacencyBonus >= 0 ? '+' : ''}${scoreBreakdown.adjacencyBonus.toLocaleString()}</li>
  `;

  html += `
      </ul>
    </div>
  `;

  return html;
}


function showRoute(routeData) {
  let startMarker = null;
  layers.route.eachLayer(layer => {
    if (layer instanceof L.CircleMarker && layer.options.radius === CONFIG.START_MARKER_RADIUS) {
      startMarker = layer;
    }
  });

  layers.route.clearLayers();

  if (startMarker) {
    startMarker.addTo(layers.route);
  }

  const latlngs = routeData.coordinates.map(coord => [coord.lat, coord.lon]);
  const routeLine = L.polyline(latlngs, {
    color: CONFIG.ROUTE_LINE_COLOR,
    weight: CONFIG.ROUTE_LINE_WEIGHT,
    opacity: CONFIG.ROUTE_LINE_OPACITY
  }).addTo(layers.route);

  if (routeData.waypoints && routeData.waypoints.length < CONFIG.MAX_WAYPOINT_MARKERS) {
    let roadAwareCount = 0;
    let fallbackCount = 0;

    routeData.waypoints.forEach((wp, index) => {
      if (index === 0) return;

      const hasRoad = wp.hasRoad !== false && wp.type !== 'center-fallback' && wp.type !== 'no-road';
      const color = hasRoad ? '#4CAF50' : '#FF5252'; 

      if (hasRoad) roadAwareCount++;
      else fallbackCount++;

      
      const markerIcon = L.divIcon({
        className: 'waypoint-marker',
        html: `<div style="
          background-color: ${color};
          color: white;
          border: 2px solid white;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 12px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          cursor: pointer;
        ">${index}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      let tooltipContent = `<b>Wegpunkt ${index}</b><br>`;
      tooltipContent += `Typ: ${wp.type || 'unknown'}<br>`;
      if (wp.priority !== undefined) {
        tooltipContent += `Priorität: ${wp.priority}<br>`;
      }
      tooltipContent += `Lat: ${wp.lat.toFixed(6)}<br>`;
      tooltipContent += `Lon: ${wp.lon.toFixed(6)}`;

      if (wp.alternatives && wp.alternatives.length > 0) {
        tooltipContent += `<br><i style="color: #1ACF;">${wp.alternatives.length} Alternativen</i>`;
      }

      const marker = L.marker([wp.lat, wp.lon], {
        icon: markerIcon,
        zIndexOffset: 1000 
      });
      marker.bindTooltip(tooltipContent, { permanent: false, direction: 'top' });
      marker.addTo(layers.route);

      if (wp.alternatives && wp.alternatives.length > 0) {
        wp.alternatives.forEach((alt, altIndex) => {
          L.circleMarker([alt.lat, alt.lon], {
            radius: 4,
            fillColor: '#1ACF',
            color: '#ffffff',
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.6,
            zIndexOffset: 900 // Below main waypoints but above route line
          }).bindTooltip(`Alt ${index}.${altIndex + 1}: ${alt.type}<br>Priority: ${alt.priority || 'N/A'}`, {
            permanent: false,
            direction: 'top'
          }).addTo(layers.route);
        });
      }
    });
  }
}

function getProposedLayer() {
  return layers.proposed;
}

function clearRoute() {
  layers.route.clearLayers();
}

defineExpose({
  onKmlLoaded,
  showProposedSquares,
  showRoute,
  getProposedLayer,
  clearRoute
});
</script>

<template>
  <div ref="mapContainer" class="leaflet-map"></div>
</template>

<style scoped>
.leaflet-map {
  flex: 1;
  height: 100%;
  z-index: 0;
}

:deep(.score-popup) {
  font-family: Arial, sans-serif;
  font-size: 12px;
}

:deep(.score-popup .square-score-details h4) {
  margin: 0 0 10px 0;
  color: #333;
  font-size: 14px;
}

:deep(.score-popup .square-score-details h5) {
  margin: 10px 0 5px 0;
  color: #555;
  font-size: 13px;
}

:deep(.score-popup .square-score-details p) {
  margin: 5px 0;
}

:deep(.score-popup .square-score-details ul) {
  margin: 5px 0;
  padding-left: 20px;
}

:deep(.score-popup .square-score-details li) {
  margin: 3px 0;
}

:deep(.score-popup .square-score-details hr) {
  margin: 10px 0;
  border: none;
  border-top: 1px solid #ddd;
}
</style>
