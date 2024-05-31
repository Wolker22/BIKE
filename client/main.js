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
    // Obtiene el valor del input de nombre de usuario
    const userInput = document.getElementById("username-input").value.trim();
    if (userInput) username = userInput; // Verifica si hay un valor y lo asigna a username
    document.getElementById("username-display").textContent = username;
    initWebSocket();
  } catch (error) {
    console.error("Error obteniendo el nombre de usuario:", error);
  } finally {
    initMap();
  }
}, { passive: true });


document.getElementById("start-biking-button").addEventListener("click", async () => {
  const userInput = document.getElementById("username-input").value.trim(); // Obtener el valor del input y eliminar espacios en blanco al inicio y al final
  if (userInput !== "") { // Verificar que el input no esté vacío
    username = userInput; // Asignar el valor del input a la variable username
    document.getElementById("initial-screen").style.display = "none";
    document.getElementById("map-container").style.display = "block";
    try {
      await startUpdatingLocation();
    } catch (error) {
      showError("No se pudo obtener su ubicación.");
    }
  } else {
    showError("Por favor, introduce un nombre de usuario válido."); // Mostrar un mensaje de error si el input está vacío
  }
});


function initMap() {
  const coords = { lat: 37.888175, lng: -4.779383 };

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

  // Dibujar la geovalla que cubre toda Córdoba, España
  drawGeofence();
}

function initWebSocket() {
  try {
    socket = new WebSocket("wss://bikely.mooo.com:3000"); // Asegúrate de usar tu dominio y puerto correctos

    socket.addEventListener("open", () => {
      console.log("Conectado al servidor WebSocket");
      socket.send(JSON.stringify({ type: "register", username }));
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      console.log("Mensaje recibido del servidor WebSocket:", message);
      if (message.type === "penalty") {
        showPenaltyNotification(message.data);
      } else if (message.type === "geofence") {
        drawGeofence(message.data);
      } else if (message.type === "usageTimeUpdate") {
        updateUsageTime(message.data);
      }
    });

    socket.addEventListener("close", () => {
      console.log("Desconectado del servidor WebSocket");
    });
  } catch (error) {
    console.error("Error conectando al WebSocket:", error);
  }
}

function showPenaltyNotification(penalty) {
  penaltyCount++;
  document.getElementById("penalty-count-value").textContent = penaltyCount;
  showError(`Has recibido una multa: ${penalty.reason}`);
}

function drawGeofence(geofence) {
  // Coordenadas que cubren toda Córdoba, España
  const geofenceCoords = [
    { lat: 37.9514, lng: -4.8734 },
    { lat: 37.9514, lng: -4.6756 },
    { lat: 37.8254, lng: -4.6756 },
    { lat: 37.8254, lng: -4.8734 }
  ];

  new google.maps.Polygon({
    paths: geofenceCoords,
    strokeColor: "#FF0000",
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillOpacity: 0.35,
    map: map,
  });
}

function updateUsageTime(data) {
  document.getElementById("usage-time").textContent = `Tiempo de uso: ${data.usageTime} segundos`;
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
          console.log("Ubicación del usuario obtenida:", position.coords);
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error("Error obteniendo la ubicación del usuario:", error);
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

    if (!userMarker) {
      userMarker = new google.maps.Marker({
        position: userLocation,
        map: map,
      });
      console.log("Marcador del usuario creado en:", userLocation);
    } else {
      userMarker.setPosition(userLocation);
      console.log("Marcador del usuario actualizado a:", userLocation);
    }

    intervalId = setInterval(async () => {
      const userLocation = await getUserLocation();
      userMarker.setPosition(userLocation);
      console.log("Marcador del usuario actualizado a (intervalo):", userLocation);
      await sendLocationToBackend(userLocation);
    }, 30000); // 30 segundos
  } catch (error) {
    console.error("Error en startUpdatingLocation:", error);
    showError("No se pudo obtener su ubicación.");
  }
}

async function sendLocationToBackend(location) {
  try {
    console.log("Enviando ubicación al backend:", location);
    const response = await fetch("https://bikely.mooo.com:3000/company/location", { // Usar tu dominio
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, username }), // Asegúrate de que `username` y `location` se están enviando correctamente
    });
    if (!response.ok) {
      throw new Error("Error al enviar la ubicación.");
    }
    console.log("Ubicación enviada al backend exitosamente");
  } catch (error) {
    console.error("Error al enviar la ubicación:", error);
  }
}

function showError(message) {
  const errorElement = document.getElementById("error-message");
  errorElement.textContent = message;
  errorElement.style.display = "block";
  setTimeout(() => {
    errorElement.style.display = "none";
  }, 3000);
}
