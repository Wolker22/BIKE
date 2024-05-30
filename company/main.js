let map;
let socket;
let users = {};
let geofence;
let penalties = {};

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initWebSocket();
}, { passive: true });

function initMap() {
  const coords = { lat: 37.91495442422956, lng: -4.716284234252457 };

  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 12,
    center: coords,
  });
}

function initWebSocket() {
  try {
    socket = new WebSocket("wss://bikely.mooo.com:3000"); // Asegúrate de usar tu dominio y puerto correctos

    socket.addEventListener("open", () => {
      console.log("Conectado al servidor WebSocket");
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "locationUpdate") {
        updateUserLocation(message.data);
      } else if (message.type === "usageTime") {
        updateUserUsageTime(message.data);
      }
    });

    socket.addEventListener("close", () => {
      console.log("Desconectado del servidor WebSocket");
    });
  } catch (error) {
    console.error("Error conectando al WebSocket:", error);
  }
}

function updateUserLocation(data) {
  const { username, location } = data;

  if (!users[username]) {
    users[username] = new google.maps.Marker({
      position: location,
      map: map,
      title: username,
    });
  } else {
    users[username].setPosition(location);
  }

  if (geofence && !google.maps.geometry.poly.containsLocation(new google.maps.LatLng(location), geofence)) {
    if (!penalties[username]) {
      penalties[username] = { count: 0, startTime: Date.now() };
    } else {
      const timeOutside = (Date.now() - penalties[username].startTime) / 1000;
      if (timeOutside > 30) {
        socket.send(JSON.stringify({ type: "penalty", data: { username, reason: "Fuera de la geocerca" } }));
        penalties[username].startTime = Date.now();
      }
    }
  } else {
    delete penalties[username];
  }
}

function updateUserUsageTime(data) {
  const { username, usageTime } = data;
  document.getElementById(`usage-time-${username}`).textContent = `Tiempo de uso: ${usageTime} segundos`;
}

function setGeofence(coordinates) {
  if (geofence) {
    geofence.setMap(null);
  }

  geofence = new google.maps.Polygon({
    paths: coordinates,
    strokeColor: "#FF0000",
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: "#FF0000",
    fillOpacity: 0.35,
    map: map,
  });

  socket.send(JSON.stringify({ type: "geofence", data: { coordinates } }));
}
