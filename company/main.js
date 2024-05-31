let map;
let geofencePolygon;
let geofenceCoordinates = null;
let socket;
let users = {};
let penalties = {};
let locationUpdateInterval = 30000; // 30 seconds
let usageTimers = {};
let penaltyTime = 5000; // 5 seconds for penalty

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initWebSocket();
});

function initMap() {
  const coords = { lat: 37.888175, lng: -4.779383 }; // Center of Córdoba, Spain

  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 12,
    center: coords,
  });

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
      console.warn("Unknown message type:", message.type);
  }
}

function updateUserList(usersData) {
  console.log("Updating user list:", usersData);
  usersData.forEach(user => {
    if (!users[user.username]) {
      users[user.username] = createUser(user);
    } else {
      updateUser(user);
    }
  });
  renderUserList();
}

function createUser(user) {
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

function updateUser(user) {
  const existingUser = users[user.username];
  existingUser.penalties = user.penalties || 0;
  existingUser.usageTime = loadUserUsageTime(user.username) || user.usageTime || 0;
  existingUser.isConnected = true;
}

function updateUserLocation(data) {
  const { username, location } = data;

  if (!users[username]) {
    users[username] = createUser({ username, location });
  } else {
    const user = users[username];
    user.marker.setPosition(location);
    user.isConnected = true;
  }

  checkGeofenceViolation(username, location);
  renderUserList();
}

function checkGeofenceViolation(username, location) {
  const latLng = new google.maps.LatLng(location.lat, location.lng);
  const isOutsideGeofence = !google.maps.geometry.poly.containsLocation(latLng, geofencePolygon);

  if (isOutsideGeofence) {
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
  } else {
    delete penalties[username];
  }

  users[username].penalties = penalties[username]?.count || 0;
}

function renderUserList() {
  const userListContainer = document.getElementById("user-list");
  if (!userListContainer) return;

  userListContainer.innerHTML = '';

  Object.keys(users).forEach(username => {
    const user = users[username];
    const userItem = document.createElement("div");
    userItem.className = "user-item";

    userItem.innerHTML = `
      <span>${username}</span>
      <span>Penalties: ${user.penalties}</span>
      <span>Usage Time: ${user.usageTime}</span>
      <span>Status: ${user.isConnected ? 'Connected' : 'Disconnected'}</span>
    `;

    userListContainer.appendChild(userItem);
  });
}

function startUserUsageTimer(username) {
  if (usageTimers[username]) {
    clearInterval(usageTimers[username]);
  }

  usageTimers[username] = setInterval(() => {
    if (users[username]) {
      users[username].usageTime += 1;
      saveUserUsageTime(username, users[username].usageTime);
      renderUserList();
    }
  }, 1000);
}

function saveUserUsageTime(username, usageTime) {
  localStorage.setItem(`usageTime_${username}`, usageTime);
}

function loadUserUsageTime(username) {
  return parseInt(localStorage.getItem(`usageTime_${username}`), 10);
}

function markUsersAsDisconnected() {
  Object.keys(users).forEach(username => {
    users[username].isConnected = false;
  });
  renderUserList();
}
