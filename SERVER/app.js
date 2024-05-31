const express = require("express");
const https = require("https");
const fs = require("fs");
const cors = require("cors");
const WebSocket = require("ws");
const path = require("path");
const axios = require("axios");
const { Client } = require("odoo-xmlrpc");
const locationsRouter = require("./routes/locations");
const geofenceRouter = require("./routes/geofence");
const connectDB = require('./config/db');

// Leer certificados SSL
const privateKey = fs.readFileSync('/etc/letsencrypt/live/bikely.mooo.com/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/bikely.mooo.com/fullchain.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const app = express();
const server = https.createServer(credentials, app);
const wss = new WebSocket.Server({ server });

let clients = {};
const userViolations = {};

// Configurar conexión a Odoo
const odooConfig = {
  url: 'https://bikely.csproject.org/jsonrpc',
  db: 'odoo16',
  username: 'i12sagud@uco.es', // Usuario de Odoo
  password: 'trabajosif123',   // Contraseña de Odoo
};

const odoo = new Client({
  url: odooConfig.url,
  db: odooConfig.db,
  username: odooConfig.username,
  password: odooConfig.password
});

// Conectar a la base de datos
(async () => {
  try {
    await connectDB();
    console.log('MongoDB connected...');

    const corsOptions = {
      origin: 'https://bikely.mooo.com',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    };
    app.use(cors(corsOptions));
    app.options('*', cors(corsOptions));

    app.use(express.json());
    app.use("/client", express.static(path.join(__dirname, "../client")));
    app.use("/company", express.static(path.join(__dirname, "../company")));
    app.use("/locations", locationsRouter);
    app.use("/geofence", geofenceRouter);

    // Ruta para validar usuario en Odoo
    app.post("/validate-user", async (req, res) => {
      const { username, password } = req.body;
      console.log("Received username:", username);

      const payload = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "common",
          method: "login",
          args: [odooConfig.db, username, password]
        },
        id: new Date().getTime()
      };

      console.log("Odoo request payload:", payload);

      try {
        const response = await axios.post(odooConfig.url, payload);
        console.log("Odoo response:", response.data);

        if (response.data.result) {
          res.status(200).json({ valid: true });
        } else {
          res.status(401).json({ valid: false });
        }
      } catch (error) {
        console.error("Error connecting to Odoo:", error);
        res.status(500).json({ valid: false, error: "Internal Server Error", details: error.message });
      }
    });

    // Ruta para recibir la ubicación de la compañía
    app.post("/company/location", async (req, res) => {
      const { location, username } = req.body;
      console.log("Received coordinates:", location);
      console.log("User:", username);

      broadcastToClients({
        type: "locationUpdate",
        data: { username, location, enterTime: new Date() }
      });
      res.sendStatus(200);
    });

    // Ruta para generar una factura en Odoo
    app.post('/generate-invoice', async (req, res) => {
      const { username, penalties, usageTime } = req.body;

      try {
        // Autenticación en Odoo
        await odoo.connect();

        // Datos de la factura
        const invoiceData = {
          partner_id: 1, // ID del cliente en Odoo
          type: 'out_invoice',
          invoice_line_ids: [
            [0, 0, {
              name: `Penalties for user ${username}`,
              quantity: penalties,
              price_unit: 10 // Precio por penalización
            }],
            [0, 0, {
              name: `Usage time for user ${username}`,
              quantity: usageTime,
              price_unit: 1 // Precio por unidad de tiempo de uso
            }]
          ]
        };

        // Crear la factura
        const response = await odoo.execute_kw('account.move', 'create', [invoiceData]);
        res.status(200).json({ invoiceId: response });
      } catch (error) {
        console.error('Error creating invoice in Odoo:', error);
        res.status(500).json({ error: 'Failed to create invoice' });
      }
    });

    // Configurar WebSocket
    wss.on("connection", (ws) => {
      ws.on("message", (message) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === "register") {
          clients[parsedMessage.username] = ws;
          sendUserList();
        } else if (parsedMessage.type === "usageTime") {
          if (userViolations[parsedMessage.username]) {
            userViolations[parsedMessage.username].usageTime = parsedMessage.usageTime;
            broadcastToClients({
              type: "usageTimeUpdate",
              data: { username: parsedMessage.username, usageTime: parsedMessage.usageTime }
            });
          }
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
      broadcastToClients(message);
    }

    function broadcastToClients(message) {
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      Object.values(clients).forEach(client => client.send(messageStr));
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
