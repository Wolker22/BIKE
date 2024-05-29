let map;
let drawingManager;
let geofencePolygon;
let autocomplete;
let ws;

function initMap() {
  const coords = { lat: 37.914954, lng: -4.716284 };
  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 12,
    center: coords,
  });

  drawingManager = new google.maps.drawing.DrawingManager({
    drawingMode: google.maps.drawing.OverlayType.POLYGON,
    drawingControl: true,
    drawingControlOptions: {
      position: google.maps.ControlPosition.TOP_CENTER,
      drawingModes: ['polygon']
    },
    polygonOptions: {
      editable: true,
      draggable: true
    }
  });

  drawingManager.setMap(map);

  google.maps.event.addListener(drawingManager, 'overlaycomplete', event => {
    if (geofencePolygon) {
      geofencePolygon.setMap(null);
    }
    geofencePolygon = event.overlay;
    const coordinates = geofencePolygon.getPath().getArray().map(latlng => ({
      lat: latlng.lat(),
      lng: latlng.lng()
    }));
    saveGeofenceToLocal(coordinates); // Save geofence to local storage
    sendGeofenceToBackend(coordinates); // Send geofence to backend
    sendGeofenceToClients(coordinates); // Send geofence to clients via WebSocket
  });

  google.maps.event.addDomListenerOnce(map, 'idle', () => {
    searchGoogleMap();
    loadGeofenceFromLocal(); // Load saved geofence from local storage when map loads
  });
}

function sendGeofenceToBackend(coordinates) {
  fetch('https://yourserver.com/geofence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates })
  })
  .then(response => response.json())
  .then(data => {
    console.log('Geofence saved:', data);
  })
  .catch(error => console.error('Error saving geofence:', error));
}

function sendGeofenceToClients(coordinates) {
  const message = {
    type: 'geofence',
    coordinates: coordinates
  };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.error("WebSocket is not open.");
  }
}

function searchGoogleMap() {
  const input = document.getElementById("place-input");
  autocomplete = new google.maps.places.Autocomplete(input);
  autocomplete.bindTo("bounds", map);

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) {
      console.error("No details available for input: '" + place.name + "'");
      return;
    }
    map.setCenter(place.geometry.location);
    map.setZoom(15);
    showPlaceInformation(place);
  });
}

function showPlaceInformation(place) {
  const reviewsHtml = place.reviews ? place.reviews.map(review => `
    <div>
      <p>Author: ${review.author_name}</p>
      <p>Rating: ${review.rating}</p>
      <p>${review.text}</p>
    </div>
  `).join('') : "<p>No reviews available for this place.</p>";
  document.getElementById("place-reviews").innerHTML = reviewsHtml;
}

// WebSocket initialization
function initWebSocket() {
  ws = new WebSocket("wss://yourserver.com");
  
  ws.onopen = () => {
    console.log("Connected to WebSocket server");
  };

  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.type === 'geofence') {
      updateGeofenceOnMap(data.coordinates);
    }
  };

  ws.onclose = () => {
    console.log("WebSocket connection closed. Reconnecting in 5 seconds...");
    setTimeout(initWebSocket, 5000);
  };

  ws.onerror = error => {
    console.error("WebSocket error:", error);
  };
}

function updateGeofenceOnMap(coordinates) {
  if (geofencePolygon) {
    geofencePolygon.setMap(null);
  }
  geofencePolygon = new google.maps.Polygon({
    paths: coordinates,
    strokeColor: "#FF0000",
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: "#FF0000",
    fillOpacity: 0.35
  });
  geofencePolygon.setMap(map);
  saveGeofenceToLocal(coordinates); // Save geofence to local storage
}

function saveGeofenceToLocal(coordinates) {
  localStorage.setItem("geofenceCoordinates", JSON.stringify(coordinates));
}

function loadGeofenceFromLocal() {
  const savedCoordinates = localStorage.getItem("geofenceCoordinates");
  if (savedCoordinates) {
    const coordinates = JSON.parse(savedCoordinates);
    updateGeofenceOnMap(coordinates);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initWebSocket();
});
