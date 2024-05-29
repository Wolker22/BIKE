const express = require("express");
const https = require("https");
const fs = require("fs");
const WebSocket = require("ws");
const locationsRouter = require("./routes/locations");
const geofenceRouter = require("./routes/geofence");
const path = require("path");

// Cargar los certificados SSL desde el directorio de Certbot
const privateKey = fs.readFileSync("/etc/letsencrypt/live/bikely.mooo.com/privkey.pem", "utf8");
const certificate = fs.readFileSync("/etc/letsencrypt/live/bikely.mooo.com/fullchain.pem", "utf8");

const credentials = { key: privateKey, cert: certificate };

const app = express();
const server = https.createServer(credentials, app);
const wss = new WebSocket.Server({ server });

let clients = {};

app.use(express.json());

// Configurar Express para servir archivos estáticos desde los directorios "client" y "company"
app.use("/client", express.static(path.join(__dirname, "../client")));
app.use("/company", express.static(path.join(__dirname, "../company")));

// Utilizar los routers para las rutas '/locations' y '/geofence'
app.use("/locations", locationsRouter);
app.use("/geofence", geofenceRouter);

// WebSocket connection handling
wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    const parsedMessage = JSON.parse(message);
    if (parsedMessage.type === "register") {
      const username = parsedMessage.username;
      clients[username] = ws; // Register the client
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
  // Esta función debería implementar la lógica para obtener los usuarios dentro de la geocerca
  return [
    { username: "usuario1", location: { lat: 37.914954, lng: -4.716284 } },
    // Más usuarios...
  ];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
