let map;
let drawingManager;
let geofencePolygon;
let autocomplete;
const users = [];
let geofenceCoordinates = null; // Variable global para almacenar las coordenadas del geofence
let ws; // Variable global para el WebSocket

function initMap() {
  const coords = { lat: 37.91495442422956, lng: -4.716284234252457 };

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
    geofenceCoordinates = coordinates; // Guarda las coordenadas del geofence en la variable global
    saveGeofenceToLocal(coordinates); // Guarda las coordenadas del geofence en el almacenamiento local
    defineGeofence(); // Envía la geofence a todos los clientes conectados
  });

  google.maps.event.addDomListenerOnce(map, 'idle', () => {
    searchGoogleMap();
    loadGeofenceFromLocal(); // Cargar geofence guardado desde el almacenamiento local al cargar el mapa
  });
}

function sendGeofenceToBackend(geofenceId, coordinates) {
  fetch('http://localhost:3000/geofence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ geofenceId, coordinates })
  })
  .then(response => response.json())
  .then(data => {
    console.log('Geofence guardada:', data);
  })
  .catch(error => console.error('Error al guardar la geofence:', error));
}

function sendGeofenceToClients(geofenceId, coordinates) {
  const message = {
    type: 'geofence',
    geofenceId: geofenceId,
    coordinates: coordinates
  };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.error("WebSocket no está abierto.");
  }
}

function defineGeofence() {
  // Obtener las coordenadas del geofence
  const coordinates = geofenceCoordinates;
  
  // Generar un ID único para esta geofence (puedes utilizar un timestamp por ejemplo)
  const geofenceId = Date.now().toString();

  // Enviar la geofence al backend
  sendGeofenceToBackend(geofenceId, coordinates);

  // Enviar la geofence a todos los clientes conectados
  sendGeofenceToClients(geofenceId, coordinates);

  // Otras acciones, como guardar la geofence localmente
  saveGeofenceToLocal(coordinates);
}

function searchGoogleMap() {
  const input = document.getElementById("place-input");
  autocomplete = new google.maps.places.Autocomplete(input);
  autocomplete.bindTo("bounds", map);

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();

    if (!place.geometry || !place.geometry.location) {
      console.error("Error: No se encontró información de este lugar.");
      return;
    }

    map.setCenter(place.geometry.location);
    map.setZoom(19);

    // Mostrar información del lugar
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
  `).join('') : "<p>No hay reseñas disponibles para este lugar.</p>";
  document.getElementById("place-reviews").innerHTML = reviewsHtml;
}

function updateUserList(users) {
  const userListContainer = document.getElementById("user-list");
  userListContainer.innerHTML = "";
  users.forEach(user => {
    const userElement = document.createElement("li");
    userElement.textContent = `ID: ${user.userId}, Ubicación: ${user.latitude}, ${user.longitude}, Multas: ${user.penaltyAmount}`;
    userListContainer.appendChild(userElement);
  });
}

// Función para inicializar el WebSocket
function initWebSocket() {
  ws = new WebSocket("ws://localhost:3000");
  
  ws.onopen = () => {
    console.log("Conectado al servidor WebSocket");
  };
  
  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.type === 'users') {
      updateUserList(data.users);
    } else if (data.type === 'geofence') {
      updateGeofenceOnMap(data.coordinates);
    }
  };

  ws.onclose = () => {
    console.log("Desconectado del servidor WebSocket. Reintentando en 5 segundos...");
    setTimeout(initWebSocket, 5000);
  };

  ws.onerror = error => {
    console.error("WebSocket error:", error);
  };
}

// Función para actualizar la geofence en el mapa cuando se recibe una actualización
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
  geofenceCoordinates = coordinates;
}

// Función para guardar las coordenadas del geofence en el almacenamiento local del navegador
function saveGeofenceToLocal(coordinates) {
  localStorage.setItem("geofenceCoordinates", JSON.stringify(coordinates));
}

// Función para cargar las coordenadas del geofence desde el almacenamiento local del navegador
function loadGeofenceFromLocal() {
  const savedCoordinates = localStorage.getItem("geofenceCoordinates");
  if (savedCoordinates) {
    geofenceCoordinates = JSON.parse(savedCoordinates);
    // Dibujar el geofence en el mapa
    if (geofenceCoordinates) {
      const polygon = new google.maps.Polygon({
        paths: geofenceCoordinates,
        strokeColor: "#FF0000",
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: "#FF0000",
        fillOpacity: 0.35
      });
      polygon.setMap(map);
      geofencePolygon = polygon;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initWebSocket();
});
