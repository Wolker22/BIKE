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
  loadUserUsageTimesFromLocal(); // Load user usage times from localStorage
});

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 16,
    center: { lat: 37.7749, lng: -122.4194 }, // San Francisco as default location
  });
}

function initWebSocket() {
  socket = new WebSocket("wss://bikely.mooo.com");

  socket.onopen = () => {
    console.log("WebSocket connection opened.");
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "userList") {
      updateUserList(message.data);
    } else if (message.type === "locationUpdate") {
      handleLocationUpdate(message.data);
    } else if (message.type === "usageTimeUpdate") {
      handleUsageTimeUpdate(message.data);
    }
  };

  socket.onclose = () => {
    console.log("WebSocket connection closed. Reconnecting in 5 seconds...");
    setTimeout(initWebSocket, 5000);
  };

  socket.onerror = (error) => {
    console.error("WebSocket error:", error);
  };
}

function updateUserList(usersData) {
  const userListElement = document.getElementById("user-list");
  userListElement.innerHTML = "";
  usersData.forEach((user) => {
    const userElement = document.createElement("div");
    userElement.innerHTML = `
      <strong>Username:</strong> ${user.username}<br>
      <button onclick="generateInvoiceForUser('${user.username}')">Generate Invoice</button>
    `;
    userListElement.appendChild(userElement);
  });
}

function handleLocationUpdate(data) {
  const { username, location, enterTime } = data;
  if (!users[username]) {
    users[username] = {
      marker: new google.maps.Marker({
        position: location,
        map: map,
        title: username,
      }),
      enterTime: new Date(enterTime),
      penalties: 0,
      usageTime: 0,
    };
    startUserUsageTimer(username);
  } else {
    users[username].marker.setPosition(location);
  }
}

function handleUsageTimeUpdate(data) {
  const { username, usageTime } = data;
  if (users[username]) {
    users[username].usageTime = usageTime;
  }
}

function startUserUsageTimer(username) {
  if (!usageTimers[username]) {
    usageTimers[username] = setInterval(() => {
      if (users[username]) {
        users[username].usageTime += locationUpdateInterval / 1000; // Add time in seconds
        saveUserUsageTime(username, users[username].usageTime); // Save usage time to localStorage
        socket.send(JSON.stringify({
          type: "usageTime",
          username: username,
          usageTime: users[username].usageTime,
        }));
      }
    }, locationUpdateInterval);
  }
}

function stopUserUsageTimer(username) {
  if (usageTimers[username]) {
    clearInterval(usageTimers[username]);
    delete usageTimers[username];
  }
}

function saveUserUsageTime(username, usageTime) {
  const userUsageTimes = JSON.parse(localStorage.getItem("userUsageTimes") || "{}");
  userUsageTimes[username] = usageTime;
  localStorage.setItem("userUsageTimes", JSON.stringify(userUsageTimes));
}

function loadUserUsageTimesFromLocal() {
  const userUsageTimes = JSON.parse(localStorage.getItem("userUsageTimes") || "{}");
  Object.keys(userUsageTimes).forEach(username => {
    if (users[username]) {
      users[username].usageTime = userUsageTimes[username];
    }
  });
}

async function generateInvoiceForUser(username) {
  const user = users[username];
  if (!user) {
    console.error(`User ${username} not found`);
    return;
  }

  try {
    const response = await fetch("https://bikely.mooo.com/generate-invoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
    });
    const result = await response.json();
    if (response.ok) {
      console.log("Invoice created for user", username);
      // Reset user's usage time to 0 after generating the invoice
      user.usageTime = 0;
      saveUserUsageTime(username, 0);
      renderUserList();
    } else {
      console.error("Error creating invoice for user", username, result.error);
    }
  } catch (error) {
    console.error("Error creating invoice for user", username, error);
  }
}

function renderUserList() {
  const userListElement = document.getElementById("user-list");
  userListElement.innerHTML = "";
  Object.keys(users).forEach(username => {
    const user = users[username];
    const userElement = document.createElement("div");
    userElement.innerHTML = `
      <strong>Username:</strong> ${username}<br>
      <strong>Penalties:</strong> ${user.penalties}<br>
      <strong>Usage Time:</strong> ${user.usageTime} seconds<br>
      <button onclick="stopUserUsageTimer('${username}')">Stop Timer</button>
      <button onclick="generateInvoiceForUser('${username}')">Generate Invoice</button>
    `;
    userListElement.appendChild(userElement);
  });
}
