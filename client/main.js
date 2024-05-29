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
}, { passive: true });

function initMap() {
  const coords = { lat: 37.91495442422956, lng: -4.716284234252457 };

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
  socket = new WebSocket("wss://localhost:3000");

  socket.addEventListener("open", () => {
    console.log("Conectado al servidor WebSocket");
    socket.send(JSON.stringify({ type: "register", username }));
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "penalty") {
      showPenaltyNotification(message.data);
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
        (error) => {
          reject(new Error("No se pudo obtener la ubicación."));
        }
      );
    });
  } else {
    throw new Error("Geolocalización no es soportada por este navegador.");
  }
}

async function startUpdatingLocation() {
  try {
    const userLocation = await getUserLocation();
    map.setCenter(userLocation);
    map.setZoom(19);

    if (userMarker) userMarker.setMap(null);
    userMarker = new google.maps.Marker({
      position: userLocation,
      map: map,
    });

    intervalId = setInterval(async () => {
      const userLocation = await getUserLocation();
      userMarker.setPosition(userLocation);
      await sendLocationToBackend(userLocation);
    }, 5000);
  } catch (error) {
    showError("No se pudo obtener su ubicación.");
  }
}

async function sendLocationToBackend(location) {
  try {
    const response = await fetch("https://localhost:3000/company/location", {
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

async function getOdooUsername() {
  try {
    const response = await fetch("https://localhost:3000/odoo/username");
    if (!response.ok) {
      throw new Error("Error al obtener el nombre de usuario.");
    }
    const data = await response.json();
    return data.username;
  } catch (error) {
    console.error("Error obteniendo el nombre de usuario:", error);
    return null;
  }
}

function showError(message) {
  const errorElement = document.getElementById("error-message");
  errorElement.textContent = message;
  errorElement.style.display = "block";
}
