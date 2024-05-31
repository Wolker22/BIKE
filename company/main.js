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
    [
      username,
      user.penalties,
      user.usageTime,
    ]
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(userData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'User Data');
  
  XLSX.writeFile(workbook, `${username}_data.xlsx`);

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

  const updateUsageTime = () => {
    if (users[username] && users[username].isConnected) {
      users[username].usageTime += 1;
      saveUserUsageTime(username, users[username].usageTime);
      socket.send(JSON.stringify({ type: "usageTimeUpdate", data: { username, usageTime: users[username].usageTime } }));
      renderUserList();
    }
  };

  usageTimers[username] = setInterval(updateUsageTime, 1000);
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
