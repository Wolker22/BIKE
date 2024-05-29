let ws;

function updateUserList(users) {
  const userListContainer = document.getElementById("user-list");
  userListContainer.innerHTML = "";
  users.forEach(user => {
    const userElement = document.createElement("li");
    userElement.textContent = `ID: ${user.userId}, Ubicación: ${user.latitude}, ${user.longitude}, Multas: ${user.penaltyAmount}`;
    userListContainer.appendChild(userElement);
  });
}

function initWebSocket() {
  ws = new WebSocket("wss://yourserver.com");
  
  ws.onopen = () => {
    console.log("Connected to WebSocket server");
  };

  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.type === 'users') {
      updateUserList(data.users);
    }
  };

  ws.onclose = () => {
    console.log("WebSocket connection closed. Reconnecting in 5 seconds...");
    setTimeout(initWebSocket, 5000);
  };

  ws.onerror = error => {
    console.error("WebSocket error:", error);
  };
}

document.addEventListener("DOMContentLoaded", () => {
  initWebSocket();
});
