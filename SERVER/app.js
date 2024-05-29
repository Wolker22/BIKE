const express = require("express");
const https = require("https");
const fs = require("fs");
const WebSocket = require("ws");
const path = require("path");
const locationsRouter = require("./routes/locations");
const geofenceRouter = require("./routes/geofence");
const connectDB = require('./config/db');

// Cargar certificados SSL
const privateKeyPath = "/etc/letsencrypt/live/bikely.mooo.com/privkey.pem";
const certificatePath = "/etc/letsencrypt/live/bikely.mooo.com/fullchain.pem";

const credentials = {
  key: fs.readFileSync(privateKeyPath, "utf8"),
  cert: fs.readFileSync(certificatePath, "utf8")
};

const app = express();
const server = https.createServer(credentials, app);
const wss = new WebSocket.Server({ server });

let clients = {};

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
          clients[parsedMessage.username] = ws;
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

    // Nueva ruta para manejar la ubicación
    app.post("/company/location", (req, res) => {
      const { location, username } = req.body;
      console.log("Coordenadas recibidas:", location);
      console.log("Usuario:", username);
      res.sendStatus(200);
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error('Error connecting to MongoDB:', err.message);
    process.exit(1);
  }
})();
