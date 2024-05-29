let map;
let autocomplete;
let userMarker;
let username = "NO USUARIO";
let intervalId;
let directionsRenderer;
let penaltyCount = 0;
let socket;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const user = await getOdooUsername();
    if (user) username = user;
    document.getElementById("username-display").textContent = username;
    initWebSocket();
  } catch (error) {
    console.error("Error obteniendo el nombre de usuario:", error);
  } finally {
    initMap();
  }
});

function initMap() {
  const coords = { lat: 37.914954, lng: -4.716284 };

  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 12,
    center: coords,
  });

  autocomplete = new google.maps.places.Autocomplete(
    document.getElementById("place-input"),
    { types: ["geocode"] }
  );

  autocomplete.bindTo("bounds", map);

  autocomplete.addListener("place_changed", async () => {
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
  });

  directionsRenderer = new google.maps.DirectionsRenderer();
  directionsRenderer.setMap(map);
}

function initWebSocket() {
  socket = new WebSocket("wss://bikely.mooo.com");

  socket.addEventListener("open", () => {
    console.log("Conectado al servidor WebSocket");
    socket.send(JSON.stringify({ type: "register", username }));
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "penalty") {
      showPenaltyNotification(message.data);
    } else if (message.type === "geofence") {
      updateGeofence(message.coordinates);
    }
  });

  socket.addEventListener("close", () => {
    console.log("Desconectado del servidor WebSocket");
  });
}

function showPenaltyNotification(penalty) {
  penaltyCount++;
  document.getElementById("penalty-count-value").textContent = penaltyCount;
  showError(`Has recibido una multa: ${penalty.reason}`);
}

function updateGeofence(coordinates) {
  // Lógica para actualizar la geocerca en el mapa
}

async function traceRouteToPlace(destination, name, photoUrl) {
  try {
    const userLocation = await getUserLocation();
    const directionsService = new google.maps.DirectionsService();

    const request = {
      origin: userLocation,
      destination: destination,
      travelMode: google.maps.TravelMode.WALKING,
    };

    directionsService.route(request, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK) {
        directionsRenderer.setDirections(result);
        const placeData = {
          name: name,
          reviews: [],
          photos: [{ getUrl: () => photoUrl }]
        };
        showPlaceInformation(placeData);
      } else {
        showError("Error al calcular la ruta.");
      }
    });
  } catch (error) {
    showError("No se pudo obtener su ubicación.");
  }
}

async function getUserLocation() {
  if (navigator.geolocation) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => reject(error),
        { enableHighAccuracy: true }
      );
    });
  } else {
    throw new Error("Su navegador no soporta la geolocalización.");
  }
}

document.getElementById("start-biking-button").addEventListener("click", () => {
  document.getElementById("initial-screen").style.display = "none";
  document.getElementById("map-container").style.display = "block";
  startUpdatingLocation();
});

document.getElementById("logout-button").addEventListener("click", () => {
  endSession(true);
});

async function endSession(isLogout = false) {
  clearInterval(intervalId);

  try {
    const response = await fetch("https://bikely.mooo.com:3000/locations/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await response.json();
    alert(`Uso finalizado. Tiempo total: ${data.timeUsed} minutos. Número de multas: ${data.penaltyAmount}`);
    if (isLogout) {
      window.location.href = "thanks/thanks.html";
    } else {
      location.reload();
    }
  } catch (error) {
    showError("Error al finalizar el uso.");
    console.error("Error al finalizar el uso:", error);
    if (isLogout) {
      window.location.href = "thanks/thanks.html";
    }
  }
}

function startUpdatingLocation() {
  if (navigator.geolocation) {
    intervalId = setInterval(async () => {
      try {
        const position = await getUserLocation();
        const location = { lat: position.lat, lng: position.lng };
        await sendLocationToBackend(location);
        if (!userMarker) {
          userMarker = new google.maps.Marker({
            position: location,
            map: map,
          });
        } else {
          userMarker.setPosition(location);
        }
        map.setCenter(location);
      } catch (error) {
        console.error("Error obteniendo la ubicación:", error);
      }
    }, 5000);
  } else {
    showError("Su navegador no soporta la geolocalización.");
  }
}

async function sendLocationToBackend(location) {
  try {
    const response = await fetch("https://localhost:3000/../SERVER/models/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, username }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Error al enviar la ubicación: ${errorData.message}`);
    }
  } catch (error) {
    console.error("Error al enviar la ubicación:", error);
  }
}

function showError(message) {
  const notificationContainer = document.getElementById("notification-container");
  notificationContainer.textContent = message;
  notificationContainer.style.display = "block";
  setTimeout(() => {
    notificationContainer.style.display = "none";
  }, 3000);
}

async function getOdooUsername() {
  try {
    const response = await fetch("https://bikely.mooo.com:3000/odoo/username", { credentials: "include" });
    if (!response.ok) {
      throw new Error("No se pudo obtener el nombre de usuario.");
    }
    const data = await response.json();
    return data.username;
  } catch (error) {
    console.error("Error obteniendo el nombre de usuario:", error);
    return null;
  }
}
