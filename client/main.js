// Global Variables
let map, autocomplete, userMarker, intervalId, directionsRenderer, geofencePolygon, socket;
let username = "NO USUARIO";
let penaltyCount = 0;

// Event Listeners
document.addEventListener("DOMContentLoaded", initPage);
document.getElementById("start-biking-button").addEventListener("click", handleStartBiking);

// Page Initialization
async function initPage() {
  initMap();
  const userInput = document.getElementById("username-input").value.trim();
  if (userInput) {
    const validUser = await validateUsername(userInput);
    if (validUser) {
      username = userInput;
      document.getElementById("username-display").textContent = username;
      initWebSocket();
    } else {
      showError("Nombre de usuario no válido. Por favor, intente nuevamente.");
    }
  }
}

// Map Initialization
function initMap() {
  const coords = { lat: 37.888175, lng: -4.779383 };
  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 12,
    center: coords,
  });

  autocomplete = new google.maps.places.Autocomplete(document.getElementById("place-input"), { types: ["geocode"] });
  autocomplete.bindTo("bounds", map);
  autocomplete.addListener("place_changed", handlePlaceChanged);

  directionsRenderer = new google.maps.DirectionsRenderer();
  directionsRenderer.setMap(map);

  fetchGeofence();
}

// Handle Place Changed
async function handlePlaceChanged() {
  const place = autocomplete.getPlace();
  if (!place.geometry || !place.geometry.location) {
    showError("No se encontró información de este lugar.");
    return;
  }

  try {
    const userLocation = await getUserLocation();
    map.setCenter(userLocation);
    map.setZoom(19);
    traceRouteToPlace(place.geometry.location, place.name, place.photos?.[0]?.getUrl());
  } catch (error) {
    showError("No se pudo obtener su ubicación.");
  }
}

// WebSocket Initialization
function initWebSocket() {
  try {
    socket = new WebSocket("wss://bikely.mooo.com:3000");

    socket.addEventListener("open", () => {
      console.log("Conectado al servidor WebSocket");
      socket.send(JSON.stringify({ type: "register", username }));
    });

    socket.addEventListener("message", handleWebSocketMessage);
    socket.addEventListener("close", () => console.log("Desconectado del servidor WebSocket"));
  } catch (error) {
    console.error("Error conectando al WebSocket:", error);
  }
}

// Handle WebSocket Messages
function handleWebSocketMessage(event) {
  const message = JSON.parse(event.data);
  console.log("Mensaje recibido del servidor WebSocket:", message);

  switch (message.type) {
    case "penalty":
      showPenaltyNotification(message.data);
      break;
    case "geofence":
      drawGeofence(message.data);
      break;
    case "usageTimeUpdate":
      updateUsageTime(message.data);
      break;
    default:
      console.warn("Tipo de mensaje desconocido:", message.type);
  }
}

// Start Biking Handler
async function handleStartBiking() {
  const userInput = document.getElementById("username-input").value.trim();
  const passwordInput = document.getElementById("password-input").value.trim();

  if (userInput && passwordInput) {
    const validUser = await validateUser(userInput, passwordInput);
    if (validUser) {
      username = userInput;
      document.getElementById("initial-screen").style.display = "none";
      document.getElementById("map-container").style.display = "block";
      try {
        await startUpdatingLocation();
      } catch (error) {
        showError("No se pudo obtener su ubicación.");
      }
    } else {
      showError("Nombre de usuario o contraseña no válidos. Por favor, intente nuevamente.");
    }
  } else {
    showError("Por favor, introduce un nombre de usuario y contraseña válidos.");
  }
}

// Validate Username
async function validateUsername(username) {
  try {
    const response = await fetch("https://bikely.mooo.com:3000/validate-username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    const result = await response.json();
    return result.valid;
  } catch (error) {
    console.error("Error validando el nombre de usuario:", error);
    return false;
  }
}

// Validate User
async function validateUser(username, password) {
  try {
    const response = await fetch("https://bikely.mooo.com:3000/validate-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const result = await response.json();
    return result.valid;
  } catch (error) {
    console.error("Error validando el nombre de usuario y contraseña:", error);
    return false;
  }
}

// Get User Location
async function getUserLocation() {
  if (navigator.geolocation) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
        },
        (error) => reject(new Error("No se pudo obtener la ubicación."))
      );
    });
  } else {
    throw new Error("Geolocalización no es soportada por este navegador.");
  }
}

// Start Updating Location
async function startUpdatingLocation() {
  try {
    const userLocation = await getUserLocation();
    map.setCenter(userLocation);
    map.setZoom(19);

    if (!userMarker) {
      userMarker = new google.maps.Marker({
        position: userLocation,
        map: map,
      });
    } else {
      userMarker.setPosition(userLocation);
    }

    intervalId = setInterval(async () => {
      const userLocation = await getUserLocation();
      userMarker.setPosition(userLocation);
      await sendLocationToBackend(userLocation);
    }, 30000); // 30 seconds
  } catch (error) {
    showError("No se pudo obtener su ubicación.");
  }
}

// Send Location to Backend
async function sendLocationToBackend(location) {
  try {
    const response = await fetch("https://bikely.mooo.com:3000/company/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, username }),
    });
    if (!response.ok) {
      throw new Error("Error al enviar la ubicación.");
    }
  } catch (error) {
    console.error("Error al enviar la ubicación:", error);
  }
}

// Fetch Geofence from Server
function fetchGeofence() {
  fetch('/geofence')
    .then(response => response.json())
    .then(data => {
      if (data.coordinates) {
        drawGeofence(data.coordinates);
      }
    })
    .catch(error => console.error('Error fetching geofence:', error));
}

// Draw Geofence
function drawGeofence(coordinates) {
  if (geofencePolygon) {
    geofencePolygon.setMap(null);
  }

  geofencePolygon = new google.maps.Polygon({
    paths: coordinates.map(coord => ({ lat: coord[0], lng: coord[1] })),
    strokeColor: '#FF0000',
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: '#FF0000',
    fillOpacity: 0.35,
    map: map,
  });
}

// Show Penalty Notification
function showPenaltyNotification(penalty) {
  penaltyCount++;
  document.getElementById("penalty-count-value").textContent = penaltyCount;
  showError(`Has recibido una multa: ${penalty.reason}`);
}

// Update Usage Time
function updateUsageTime(data) {
  document.getElementById("usage-time").textContent = `Tiempo de uso: ${data.usageTime} segundos`;
}

// Show Error
function showError(message) {
  const errorElement = document.getElementById("error-message");
  errorElement.textContent = message;
  errorElement.style.display = "block";
  setTimeout(() => {
    errorElement.style.display = "none";
  }, 3000);
}

// Show Place Information
function showPlaceInformation(placeData) {
  console.log("Información del lugar:", placeData);
}
