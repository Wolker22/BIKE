const fs = require('fs');
const express = require("express");
const http = require("http");
const https = require("https");
const WebSocket = require("ws");
const locationsRouter = require("./routes/locations");
const geofenceRouter = require("./routes/geofence");
const path = require("path");

const app = express();

// Configurar certificados SSL
const privateKey = fs.readFileSync('/etc/letsencrypt/live/tu-dominio.com/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/tu-dominio.com/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/tu-dominio.com/chain.pem', 'utf8');

const credentials = { key: privateKey, cert: certificate, ca: ca };

const httpServer = http.createServer(app);
const httpsServer = https.createServer(credentials, app);

const wss = new WebSocket.Server({ server: httpsServer });

let clients = {};

app.use(express.json());

// Configurar Express para servir archivos estáticos desde los directorios "client" y "company"
app.use("/client", express.static(path.join(__dirname, "../client")));
app.use("/company", express.static(path.join(__dirname, "../company")));

// Redirigir HTTP a HTTPS
app.use((req, res, next) => {
  if (!req.secure) {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// Utilizar los routers para las rutas '/locations' y '/geofence'
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

const HTTP_PORT = 3000;
const HTTPS_PORT = 3443;

httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP Server running on port ${HTTP_PORT}`);
});

httpsServer.listen(HTTPS_PORT, () => {
  console.log(`HTTPS Server running on port ${HTTPS_PORT}`);
});
