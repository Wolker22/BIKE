let map;
let drawingManager;
let geofencePolygon;
let geofenceCoordinates = null;
let socket;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("geofence-button").addEventListener("click", defineGeofence);
  initWebSocket();
  initMap();  // Asegúrate de que initMap sea llamada aquí también
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
    sendGeofenceToBackend("geofence1", coordinates); // Change "geofence1" as needed
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
    const polygonPath = geofenceCoordinates.map(coord => ({ lat: coord.lat, lng: coord.lng }));
    geofencePolygon = new google.maps.Polygon({
      paths: polygonPath,
      editable: true,
      draggable: true
    });
    geofencePolygon.setMap(map);
  }
}

function sendGeofenceToBackend(geofenceId, coordinates) {
  const geofenceData = {
    geofenceId: geofenceId,
    name: 'My Geofence', // Asegúrate de proporcionar un nombre válido
    coordinates: coordinates
  };

  console.log('Sending geofence data to backend:', geofenceData);

  fetch('https://bikely.mooo.com:3000/geofence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geofenceData)
  })
  .then(response => {
    if (!response.ok) {
      return response.json().then(err => { throw new Error(err.message); });
    }
    return response.json();
  })
  .then(data => {
    console.log('Geofence guardada:', data);
  })
  .catch(error => console.error('Error al guardar la geofence:', error));
}

function sendGeofenceToClients(geofenceId, coordinates) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const message = {
      type: 'geofence',
      geofenceId: geofenceId,
      coordinates: coordinates
    };
    socket.send(JSON.stringify(message));
  } else {
    console.error('El socket no está abierto o no está definido.');
  }
}

function initWebSocket() {
  socket = new WebSocket("wss://bikely.mooo.com:3000");

  socket.addEventListener("open", () => {
    console.log("Conectado al servidor WebSocket");
    socket.send(JSON.stringify({ type: "register", username: "company" }));
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "geofenceUpdate") {
      console.log("Geofence actualizada:", message);
    } else if (message.type === "userList") {
      updateUserList(message.data);
    }
  });

  socket.addEventListener("close", () => {
    console.log("Desconectado del servidor WebSocket");
  });
}

function updateUserList(users) {
  const userListContainer = document.getElementById("user-list");
  userListContainer.innerHTML = "";
  users.forEach(user => {
    const userElement = document.createElement("li");
    userElement.textContent = user.username;
    userListContainer.appendChild(userElement);
  });
}
