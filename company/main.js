let map;
let geofencePolygon;
let geofenceCoordinates = null;
let socket;
let users = {};
let penalties = {};
let locationUpdateInterval = 30000; // 30 seconds
let usageTimers = {};
let penaltyTime = 5000; // 5 seconds for penalty
let drawingManager;

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initWebSocket();
  loadUserUsageTimesFromLocal();
});

function initMap() {
  const coords = { lat: 37.888175, lng: -4.779383 }; // Center of Córdoba, Spain

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
      fillColor: '#FF0000',
      fillOpacity: 0.35,
      strokeWeight: 2,
      strokeColor: '#FF0000',
      clickable: false,
      editable: true,
      zIndex: 1
    }
  });

  drawingManager.setMap(map);

  google.maps.event.addListener(drawingManager, 'polygoncomplete', (polygon) => {
    if (geofencePolygon) {
      geofencePolygon.setMap(null);
    }
    geofencePolygon = polygon;

    const coordinates = polygon.getPath().getArray().map(latLng => [latLng.lat(), latLng.lng()]);
    uploadGeofence(coordinates);
  });

  // Default geofence coordinates covering Córdoba, Spain
  geofenceCoordinates = [
    { lat: 37.9514, lng: -4.8734 },
    { lat: 37.9514, lng: -4.6756 },
    { lat: 37.8254, lng: -4.6756 },
    { lat: 37.8254, lng: -4.8734 },
  ];

  geofencePolygon = new google.maps.Polygon({
    paths: geofenceCoordinates,
    strokeColor: '#FF0000',
    fillOpacity: 0.2,
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
    handleWebSocketMessage(message);
  });

  socket.addEventListener("close", () => {
    console.log("Disconnected from WebSocket server");
    markUsersAsDisconnected();
  });

  socket.addEventListener("error", (error) => {
    console.error("WebSocket error:", error);
  });
}

function handleWebSocketMessage(message) {
  switch (message.type) {
    case "geofenceUpdate":
      console.log("Geofence updated:", message);
      break;
    case "userList":
      updateUserList(message.data);
      startLocationUpdateTimer();
      break;
    case "locationUpdate":
      updateUserLocation(message.data);
      break;
    case "usageTimeUpdate":
      updateUserUsageTime(message.data);
      break;
    case "registerConfirmation":
      startUserUsageTimer(message.username);
      break;
    default:
      console.warn("Unhandled WebSocket message type:", message.type);
  }
}

function updateUserList(usersData) {
  console.log("Updating user list:", usersData);
  usersData.forEach(user => {
    if (!users[user.username]) {
      users[user.username] = createUserObject(user);
    } else {
      updateUserObject(user);
    }
  });
  renderUserList();
}

function createUserObject(user) {
  return {
    marker: new google.maps.Marker({
      position: user.location || { lat: 0, lng: 0 },
      map: map,
      title: user.username
    }),
    penalties: user.penalties || 0,
    usageTime: loadUserUsageTime(user.username) || user.usageTime || 0,
    isConnected: true
  };
}

function updateUserObject(user) {
  users[user.username].penalties = user.penalties || 0;
  users[user.username].usageTime = loadUserUsageTime(user.username) || user.usageTime || 0;
  users[user.username].isConnected = true;
}

function updateUserLocation(data) {
  const { username, location } = data;
  const user = users[username] || createUserObject({ username, location });

  user.marker.setPosition(location);
  user.isConnected = true;
  handleGeofenceViolation(username, location);
  renderUserList();
}

function handleGeofenceViolation(username, location) {
  const latLng = new google.maps.LatLng(location.lat, location.lng);
  const isOutsideGeofence = !google.maps.geometry.poly.containsLocation(latLng, geofencePolygon);

  if (isOutsideGeofence) {
    applyPenalty(username);
  } else {
    clearPenalty(username);
  }
}

function applyPenalty(username) {
  if (!penalties[username]) {
    penalties[username] = { count: 0, startTime: Date.now() };
  } else {
    const timeOutside = Date.now() - penalties[username].startTime;
    if (timeOutside > penaltyTime) {
      socket.send(JSON.stringify({ type: "penalty", data: { username, reason: "Outside geofence" } }));
      penalties[username].count += 1;
      penalties[username].startTime = Date.now();
    }
  }
  users[username].penalties = penalties[username]?.count || 0;
}

function clearPenalty(username) {
  delete penalties[username];
  users[username].penalties = 0;
}

function renderUserList() {
  const userListContainer = document.getElementById("user-list");
  if (!userListContainer) {
    console.error("User list container not found");
    return;
  }
  userListContainer.innerHTML = "";
  Object.keys(users).forEach(username => {
    const user = users[username];
    const userElement = document.createElement("li");
    userElement.innerHTML = `
      <strong>Username:</strong> ${username}<br>
      <strong>Penalties:</strong> ${user.penalties}<br>
      <strong>Usage Time:</strong> ${user.usageTime} seconds<br>
      <strong>Location:</strong> Latitude: ${user.marker.getPosition().lat()}, Longitude: ${user.marker.getPosition().lng()}<br>
      <strong>Status:</strong> ${user.isConnected ? 'Connected' : 'Disconnected'}<br>
      <button onclick="stopUserUsageTimer('${username}')">Stop Timer</button>
      <button onclick="generateExcelForUser('${username}')">Generate Excel</button>
    `;
    userListContainer.appendChild(userElement);
  });
}

function stopUserUsageTimer(username) {
  if (usageTimers[username]) {
    clearInterval(usageTimers[username]);
    delete usageTimers[username];
    console.log(`Timer stopped for user ${username}`);
  }
}

function generateExcelForUser(username) {
  const user = users[username];
  if (!user) {
    console.error(`User ${username} not found`);
    return;
  }

  const userData = [
    ['Username', 'Penalties', 'Usage Time'],
    [username, user.penalties, user.usageTime]
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(userData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'User Data');
  
  XLSX.writeFile(workbook, `${username}_data.xlsx`);

  // Reset user's usage time to 0 after generating the Excel file
  user.usageTime = 0;
  saveUserUsageTime(username, 0);
  renderUserList();
}

function updateUserUsageTime(data) {
  const { username, usageTime } = data;
  if (users[username]) {
    users[username].usageTime = usageTime;
    saveUserUsageTime(username, usageTime);
  }
  renderUserList();
}

function startUserUsageTimer(username) {
  if (!users[username]) return;

  if (usageTimers[username]) {
    clearInterval(usageTimers[username]);
  }

  usageTimers[username] = setInterval(() => {
    if (users[username] && users[username].isConnected) {
      users[username].usageTime += 1;
      saveUserUsageTime(username, users[username].usageTime);
      socket.send(JSON.stringify({ type: "usageTimeUpdate", data: { username, usageTime: users[username].usageTime } }));
      renderUserList();
    }
  }, 1000);
}

function startLocationUpdateTimer() {
  setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "requestLocationUpdates" }));
    } else {
      console.error("Socket is not open or undefined.");
    }
  }, locationUpdateInterval);
}

function markUsersAsDisconnected() {
  Object.keys(users).forEach(username => {
    users[username].isConnected = false;
    if (usageTimers[username]) {
      clearInterval(usageTimers[username]);
      delete usageTimers[username];
    }
  });
  renderUserList();
}

function saveUserUsageTime(username, usageTime) {
  localStorage.setItem(`userUsageTime_${username}`, usageTime);
}

function loadUserUsageTime(username) {
  return parseInt(localStorage.getItem(`userUsageTime_${username}`)) || 0;
}

function loadUserUsageTimesFromLocal() {
  Object.keys(users).forEach(username => {
    users[username].usageTime = loadUserUsageTime(username);
  });
}

function uploadGeofence(coordinates) {
  fetch('/geofence', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ coordinates }),
  })
    .then(response => response.json())
    .then(data => {
      console.log('Geofence uploaded successfully:', data);
    })
    .catch(error => {
      console.error('Error uploading geofence:', error);
    });
}
