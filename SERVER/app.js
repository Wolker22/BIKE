const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const locationsRouter = require("./routes/locations");
const geofenceRouter = require("./routes/geofence");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = {};

app.use(express.json());
app.use("/locations", locationsRouter);
app.use("/geofence", geofenceRouter);

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

app.post("/geofence/penalties", async (req, res) => {
  const { coords } = req.body;
  // Aquí se puede agregar la lógica para calcular las sanciones basadas en las coordenadas de la geocerca
  const penalties = calculatePenaltiesForUsers(coords);
  res.status(200).json(penalties);
});

function calculatePenaltiesForUsers(coords) {
  // Supongamos que se obtiene una lista de usuarios con sus ubicaciones actuales
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
