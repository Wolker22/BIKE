const express = require("express");
const https = require("https");
const fs = require("fs");
const cors = require("cors");
const WebSocket = require("ws");
const path = require("path");
const locationsRouter = require("./routes/locations");
const geofenceRouter = require("./routes/geofence");
const connectDB = require('./config/db');

// Read SSL certificates
const privateKey = fs.readFileSync('/etc/letsencrypt/live/bikely.mooo.com/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/bikely.mooo.com/fullchain.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const app = express();
const server = https.createServer(credentials, app);
const wss = new WebSocket.Server({ server });

let clients = {};
const userViolations = {}; // { username: { violations: 0, enterTime: null, locations: [] } }

(async () => {
  try {
    await connectDB();
    console.log('MongoDB connected...');

    // CORS configuration
    const corsOptions = {
      origin: 'https://bikely.mooo.com:3000',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    };
    app.use(cors(corsOptions));
    app.options('*', cors(corsOptions)); // Handle all OPTIONS requests globally

    app.use(express.json());

    // Define routes
    app.use("/client", express.static(path.join(__dirname, "../client")));
    app.use("/company", express.static(path.join(__dirname, "../company")));
    app.use("/locations", locationsRouter);
    app.use("/geofence", geofenceRouter);

    app.get("/odoo/username", (req, res) => {
      res.status(200).json({ username: "testUser" });
    });

    app.post("/geofence/penalties", async (req, res) => {
      const { coords } = req.body;
      const penalties = await calculatePenaltiesForUsers(coords);
      res.status(200).json(penalties);
    });

    app.post("/geofence", (req, res) => {
      const { geofence, username } = req.body;
      // Aquí puedes guardar la geofence en la base de datos y enviar las actualizaciones necesarias a los clientes.
      res.sendStatus(200);
    });

    async function calculatePenaltiesForUsers(coords) {
      const users = await getUsersWithinGeofence(coords);
      const currentTime = new Date();

      const penalties = users.map((user) => {
        if (!userViolations[user.username]) {
          userViolations[user.username] = { violations: 0, enterTime: currentTime, locations: [] };
        }
        userViolations[user.username].violations += 1;
        userViolations[user.username].locations.push(user.location);
        return {
          username: user.username,
          reason: "Dentro de una geocerca prohibida",
          violations: userViolations[user.username].violations,
          duration: currentTime - userViolations[user.username].enterTime,
          locations: userViolations[user.username].locations,
        };
      });

      penalties.forEach((penalty) => {
        if (clients[penalty.username]) {
          clients[penalty.username].send(JSON.stringify({ type: "penalty", data: penalty }));
        }
      });

      return penalties;
    }

    async function getUsersWithinGeofence(coords) {
      // Aquí deberías consultar tu base de datos para obtener las ubicaciones de los usuarios
      // y verificar si están dentro de las coordenadas de la geofence
      return [
        { username: "usuario1", location: { lat: 37.914954, lng: -4.716284 } },
      ];
    }

    app.post("/company/location", async (req, res) => {
      const { location, username } = req.body;
      console.log("Coordenadas recibidas:", location);
      console.log("Usuario:", username);
      // Aquí deberías almacenar la ubicación en la base de datos
      res.sendStatus(200);
    });

    wss.on("connection", (ws) => {
      ws.on("message", (message) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === "register") {
          clients[parsedMessage.username] = ws;
          sendUserList();
        }
      });

      ws.on("close", () => {
        for (const [username, clientWs] of Object.entries(clients)) {
          if (clientWs === ws) {
            delete clients[username];
            sendUserList();
            break;
          }
        }
      });
    });

    function sendUserList() {
      const users = Object.keys(clients).map(username => ({ username }));
      const message = JSON.stringify({ type: "userList", data: users });
      Object.values(clients).forEach(client => client.send(message));
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
