// Global Variables
let map;
let autocomplete;
let userMarker;
let username = "NO USUARIO";
let intervalId;
let directionsRenderer;
let penaltyCount = 0;
let socket;
let initialLocationSet = false;
let geofencePolygon;

// Event Listeners
document.addEventListener("DOMContentLoaded", initPage);
document.getElementById("start-biking-button").addEventListener("click", handleStartBiking);

// Page Initialization
async function initPage() {
  try {
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
  } catch (error) {
    console.error("Error obteniendo el nombre de usuario:", error);
  } finally {
    initMap();
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

  drawGeofence();
}

// Handle Place Changed
async function handlePlaceChanged() {
  const place = autocomplete.getPlace();
  if (!place.geometry || !place.geometry.location) {
    showError("No se encontró información de este lugar.");
    return;
  }

  try {
    const position = await getCurrentPosition();
    const userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
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
    socket.addEventListener("close", () => {
      console.log("Desconectado del servidor WebSocket");
    });
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
    const text = await response.text(); // Capture raw response text
    console.log("Raw response text:", text);
    const result = JSON.parse(text); // Parse the response manually
    return result.valid;
  } catch (error) {
    console.error("Error validando el usuario:", error);
    return false;
  }
}

// Start Updating Location
async function startUpdatingLocation() {
  if (navigator.geolocation) {
    intervalId = setInterval(async () => {
      try {
        const position = await getCurrentPosition();
        const location = { lat: position.coords.latitude, lng: position.coords.longitude };
        updateUserLocationOnMap(location, true); // Pass true to prevent centering map
        await sendLocationToBackend(location);
      } catch (error) {
        console.error("Error obteniendo la ubicación actual:", error);
        if (!initialLocationSet) {
          showError("No se pudo obtener su ubicación.");
        }
      }
    }, 5000); // Update every 5 seconds
  } else {
    showError("La geolocalización no es compatible con este navegador.");
  }
}

// Get Current Position
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    });
  });
}

// Update User Location on Map
function updateUserLocationOnMap(location, preventCentering = false) {
  if (!userMarker) {
    userMarker = new google.maps.Marker({
      position: location,
      map,
      title: "Ubicación Actual"
    });
  } else {
    userMarker.setPosition(location);
  }

  // Center the map only initially
  if (!initialLocationSet && !preventCentering) {
    map.setCenter(location);
    initialLocationSet = true;
  }
}

// Send Location to Backend
async function sendLocationToBackend(location) {
  try {
    console.log("Enviando ubicación al backend:", location);
    const response = await fetch("https://bikely.mooo.com:3000/company/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, username })
    });
    if (!response.ok) {
      throw new Error("Error al enviar la ubicación.");
    }
    console.log("Ubicación enviada al backend exitosamente");
  } catch (error) {
    console.error("Error al enviar la ubicación:", error);
  }
}

// Show Error
function showError(message) {
  if (!document.getElementById("error-message")) {
    const errorMessage = document.createElement("div");
    errorMessage.id = "error-message";
    errorMessage.textContent = message;
    document.body.appendChild(errorMessage);
    setTimeout(() => {
      document.body.removeChild(errorMessage);
    }, 5000);
  }
}

// Draw Geofence
function drawGeofence(data) {
  // Definir las coordenadas de la geocerca para Córdoba
  geofenceCoordinates = [
    { lat: 37.9514, lng: -4.8734 },
    { lat: 37.9514, lng: -4.6756 },
    { lat: 37.8254, lng: -4.6756 },
    { lat: 37.8254, lng: -4.8734 },
  ];

  if (geofencePolygon) {
    geofencePolygon.setMap(null);
  }

  geofencePolygon = new google.maps.Polygon({
    paths: geofenceCoordinates,
    strokeColor: "#FF0000",
    strokeOpacity: 0.8,
    strokeWeight: 2,
  });

  geofencePolygon.setMap(map);
}

// Trace Route to Place
function traceRouteToPlace(destination, placeName, placePhotoUrl) {
  const directionsService = new google.maps.DirectionsService();

  const request = {
    origin: userMarker.getPosition(),
    destination,
    travelMode: google.maps.TravelMode.BICYCLING
  };

  directionsService.route(request, (result, status) => {
    if (status === google.maps.DirectionsStatus.OK) {
      directionsRenderer.setDirections(result);
    } else {
      showError("No se pudo trazar la ruta al destino.");
    }
  });

  if (placePhotoUrl) {
    document.getElementById("place-image").src = placePhotoUrl;
    document.getElementById("place-name").textContent = placeName;
  }
}

// Show Penalty Notification
function showPenaltyNotification(penaltyData) {
  const notification = document.createElement("div");
  notification.className = "penalty-notification";
  notification.textContent = `¡Penalización! Motivo: ${penaltyData.reason}`;
  document.body.appendChild(notification);
  setTimeout(() => {
    document.body.removeChild(notification);
  }, 5000);
}
