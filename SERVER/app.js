const express = require("express");
const https = require("https");
const fs = require("fs");
const WebSocket = require("ws");
const path = require("path");
const locationsRouter = require("./routes/locations");
const geofenceRouter = require("./routes/geofence");
const connectDB = require('./config/db');

// Cargar certificados SSL
const privateKey = fs.readFileSync("/etc/letsencrypt/live/bikely.mooo.com/privkey.pem", "utf8");
const certificate = fs.readFileSync("/etc/letsencrypt/live/bikely.mooo.com/fullchain.pem", "utf8");

const credentials = { key: privateKey, cert: certificate };

const app = express();
const server = https.createServer(credentials, app);
const wss = new WebSocket.Server({ server });

let clients = {};

// Middleware para habilitar CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // Permitir solicitudes desde cualquier origen
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE'); // Permitir los métodos HTTP especificados
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Permitir los encabezados especificados
  next();
});

// Conectar a la base de datos
(async () => {
  try {
    await connectDB();
    console.log('MongoDB connected...');

    app.use(express.json());
    app.use("/client", express.static(path.join(__dirname, "../client")));
    app.use("/company", express.static(path.join(__dirname, "../company")));
    app.use("/locations", locationsRouter);
    app.use("/geofence", geofenceRouter);

    wss.on("connection", (ws) => {
      ws.on("message", (message) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === "register") {
          const username = parsedMessage.username;
          clients[username] = ws;
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
      return [
        { username: "usuario1", location: { lat: 37.914954, lng: -4.716284 } },
      ];
    }

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error('Error connecting to MongoDB:', err.message);
    process.exit(1);
  }
})();
