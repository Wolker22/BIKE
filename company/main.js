let map;
let geofencePolygon;
let geofenceCoordinates = null;
let socket;
let users = {};
let penalties = {};
let locationUpdateInterval = 30000; // 30 segundos
let usageTimers = {};
let penaltyTime = 5000; // 5 segundos por penalización

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initWebSocket();
  loadUserUsageTimesFromLocal(); // Cargar tiempos de uso de los usuarios desde localStorage
});

function initMap() {
  const coords = { lat: 37.888175, lng: -4.779383 }; // Centro de Córdoba, España

  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 12,
    center: coords,
  });

  // Definir geovalla para cubrir toda Córdoba, España
  geofenceCoordinates = [
    { lat: 37.9514, lng: -4.8734 },
    { lat: 37.9514, lng: -4.6756 },
    { lat: 37.8254, lng: -4.6756 },
    { lat: 37.8254, lng: -4.8734 },
  ];

  geofencePolygon = new google.maps.Polygon({
    paths: geofenceCoordinates,
    strokeColor: '#FF0000', // Color rojo para el borde de la geovalla
    fillOpacity: 0.2, // Transparencia del área de la geovalla
  });
  geofencePolygon.setMap(map);
}

function initWebSocket() {
  socket = new WebSocket("wss://bikely.mooo.com:3000");

  socket.addEventListener("open", () => {
    console.log("Connected to WebSocket server");
    socket.send(JSON.stringify({ type: "register", username: "company" }));
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    console.log("WebSocket message received:", message);
    if (message.type === "geofenceUpdate") {
      console.log("Geofence updated:", message);
    } else if (message.type === "userList") {
      updateUserList(message.data);
      startLocationUpdateTimer();
    } else if (message.type === "locationUpdate") {
      updateUserLocation(message.data);
    } else if (message.type === "usageTimeUpdate") {
      updateUserUsageTime(message.data.username, message.data.usageTime);
    }
  });

  socket.addEventListener("close", () => {
    console.log("Disconnected from WebSocket server");
  });

  socket.addEventListener("error", (error) => {
    console.error("WebSocket error:", error);
  });
}

function startLocationUpdateTimer() {
  setInterval(() => {
    for (const username in users) {
      const user = users[username];
      if (user && user.marker) {
        checkGeofence(user.marker.getPosition(), username);
      }
    }
  }, locationUpdateInterval);
}

function checkGeofence(position, username) {
  const point = new google.maps.LatLng(position.lat(), position.lng());
  const isInsideGeofence = google.maps.geometry.poly.containsLocation(point, geofencePolygon);

  if (!isInsideGeofence) {
    applyPenalty(username);
  }
}

function applyPenalty(username) {
  if (!penalties[username]) {
    penalties[username] = 0;
  }
  penalties[username] += 1;
  updateUserPenalties(username);
}

function updateUserList(usersData) {
  users = {};
  const userListElement = document.getElementById("userList");
  userListElement.innerHTML = "";

  usersData.forEach((user) => {
    users[user.username] = {
      marker: null,
      usageTime: 0,
      penalties: 0,
    };
    const listItem = document.createElement("li");
    listItem.textContent = user.username;
    userListElement.appendChild(listItem);
  });

  renderUserList();
}

function updateUserLocation(data) {
  const { username, location } = data;
  if (!users[username]) {
    return;
  }

  if (!users[username].marker) {
    users[username].marker = new google.maps.Marker({
      position: location,
      map: map,
      title: username,
    });
  } else {
    users[username].marker.setPosition(location);
  }
}

function updateUserPenalties(username) {
  const user = users[username];
  if (user) {
    user.penalties = penalties[username];
    renderUserList();
  }
}

function updateUserUsageTime(username, usageTime) {
  const user = users[username];
  if (user) {
    user.usageTime = usageTime;
    saveUserUsageTime(username, usageTime); // Guardar el tiempo de uso en localStorage
    renderUserList();
  }
}

function renderUserList() {
  const userListElement = document.getElementById("userList");
  userListElement.innerHTML = "";

  for (const username in users) {
    const user = users[username];
    const listItem = document.createElement("li");
    listItem.textContent = `${username} - Uso: ${user.usageTime} mins - Penalizaciones: ${user.penalties}`;
    userListElement.appendChild(listItem);
  }
}

function saveUserUsageTime(username, usageTime) {
  localStorage.setItem(`userUsageTime_${username}`, usageTime);
}

function loadUserUsageTimesFromLocal() {
  for (const username in users) {
    const usageTime = localStorage.getItem(`userUsageTime_${username}`);
    if (usageTime) {
      updateUserUsageTime(username, parseInt(usageTime));
    }
  }
}

document.getElementById("generateInvoiceBtn").addEventListener("click", () => {
  const selectedUser = getSelectedUser(); // Implementa una función para obtener el usuario seleccionado
  if (selectedUser) {
    generateInvoiceForUser(selectedUser);
  } else {
    alert("Por favor, selecciona un usuario para generar la factura.");
  }
});

function getSelectedUser() {
  // Implementa la lógica para obtener el usuario seleccionado de la lista
  const userListElement = document.getElementById("userList");
  const selectedItem = userListElement.querySelector("li.selected"); // Supón que hay una clase 'selected' en el elemento li seleccionado
  return selectedItem ? selectedItem.textContent.split(" - ")[0] : null;
}

function generateInvoiceForUser(username) {
  const user = users[username];
  if (!user) {
    console.error(`User ${username} not found`);
    return;
  }

  const invoiceData = {
    username: username,
    penalties: user.penalties,
    usageTime: user.usageTime
  };

  axios.post('/generate-invoice', invoiceData)
    .then(response => {
      console.log('Invoice created with ID:', response.data.invoiceId);
      // Restablecer el tiempo de uso del usuario a 0 después de generar la factura
      user.usageTime = 0;
      saveUserUsageTime(username, 0);
      renderUserList();
    })
    .catch(error => {
      console.error('Error creating invoice:', error);
    });
}
