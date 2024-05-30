// MAIN.JS DEL COMPANY
let map;
let drawingManager;
let geofencePolygon;
let geofenceCoordinates = null;
let socket;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("geofence-button").addEventListener("click", defineGeofence);
  initWebSocket();
  initMap();
});

// Define initMap en el ámbito global
window.initMap = function() {
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
    geofenceCoordinates = coordinates;
    saveGeofenceToLocal(coordinates);
    sendGeofenceToBackend("geofence1", coordinates);
    sendGeofenceToClients("geofence1", coordinates);
  });

  loadGeofenceFromLocal();
}

function defineGeofence() {
  if (geofencePolygon) {
    geofencePolygon.setMap(null);
  }
  if (drawingManager) {
    drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
  } else {
    console.error("drawingManager no está definido");
  }
}

function saveGeofenceToLocal(coordinates) {
  localStorage.setItem('geofenceCoordinates', JSON.stringify(coordinates));
}

function loadGeofenceFromLocal() {
  const savedCoordinates = localStorage.getItem('geofenceCoordinates');
  if (savedCoordinates) {
    geofenceCoordinates = JSON.parse(savedCoordinates);
    geofencePolygon = new google.maps.Polygon({
      paths: geofenceCoordinates,
      editable: true,
      draggable: true
    });
    geofencePolygon.setMap(map);
  }
}

function sendGeofenceToBackend(name, coordinates) {
  fetch("https://bikely.mooo.com:3000/geofence", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ geofenceId: "geofence1", name, coordinates })
  })
  .then(response => {
    if (response.ok) {
      console.log("Geocerca enviada al backend.");
    } else {
      console.error("Error enviando geocerca al backend.");
    }
  })
  .catch(error => {
    console.error("Error en la solicitud:", error);
  });
}

function sendGeofenceToClients(name, coordinates) {
  const message = {
    type: "geofenceUpdate",
    geofenceId: "geofence1",
    name,
    coordinates
  };
  socket.send(JSON.stringify(message));
}

function initWebSocket() {
  socket = new WebSocket("wss://bikely.mooo.com:3000");

  socket.addEventListener("open", event => {
    console.log("WebSocket conectado.");
    socket.send(JSON.stringify({ type: "register", username: "company" }));
  });

  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.type === "userLocation") {
      handleUserLocationUpdate(message.data);
    }
  });

  socket.addEventListener("close", event => {
    console.log("WebSocket desconectado.");
  });
}

function handleUserLocationUpdate(userLocationData) {
  const { username, location } = userLocationData;
  console.log(`Usuario: ${username}, Ubicación: ${location.lat}, ${location.lng}`);
}
