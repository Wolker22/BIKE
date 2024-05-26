const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const locationsRouter = require("./routes/locations");
const geofenceRouter = require("./routes/geofence");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = {};

// Middleware para parsear JSON
app.use(express.json());

// Rutas API
app.use("/locations", locationsRouter);
app.use("/geofence", geofenceRouter);

// Servir las aplicaciones web
app.use("/client", express.static(path.join(__dirname, '../client')));
app.use("/company", express.static(path.join(__dirname, '../company')));

// WebSocket server
wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    const parsedMessage = JSON.parse(message);
    if (parsedMessage.type === "register") {
      const username = parsedMessage.username;
      clients[username] = ws; // Registrar el cliente
    }
  });

  ws.on("close", () => {
    for (const username in clients) {
      if (clients[username] === ws) {
        delete clients[username];
        break;
      }
    }
  });
});

// Endpoint para manejar sanciones de geocerca
app.post("/geofence/penalties", async (req, res) => {
  const { coords } = req.body;
  const penalties = calculatePenaltiesForUsers(coords);
  res.status(200).json(penalties);
});

function calculatePenaltiesForUsers(coords) {
  const users = getUsersWithinGeofence(coords);
  const penalties = users.map((user) => ({
    username: user.username,
    reason: "Dentro de una geocerca prohibida",
  }));

  penalties.forEach((penalty) => {
    if (clients[penalty.username]) {
      clients[penalty.username].send(JSON.stringify({ type: "penalty", data: penalty }));
    }
  });

  return penalties;
}

function getUsersWithinGeofence(coords) {
  return [
    { username: "usuario1", location: { lat: 37.914954, lng: -4.716284 } },
    // Más usuarios...
  ];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
