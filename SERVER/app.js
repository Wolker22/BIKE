const express = require('express');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const path = require('path');
const locationsRouter = require('./routes/locations');
const geofenceRouter = require('./routes/geofence');
const connectDB = require('./config/db');

const app = express();

// Configuración para servir archivos estáticos (si es necesario)
app.use(express.static(path.join(__dirname, 'public')));

// Configuración para las rutas de la aplicación
app.use('/locations', locationsRouter);
app.use('/geofence', geofenceRouter);

// Configuración para el servidor WebSocket
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
  // Manejar la conexión WebSocket
});

// Configuración para el servidor HTTPS
const privateKeyPath = '/etc/letsencrypt/live/bikely.mooo.com/privkey.pem';
const certificatePath = '/etc/letsencrypt/live/bikely.mooo.com/fullchain.pem';

const credentials = {
  key: fs.readFileSync(privateKeyPath, 'utf8'),
  cert: fs.readFileSync(certificatePath, 'utf8'),
};

const httpsServer = https.createServer(credentials, app);

httpsServer.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Conexión a la base de datos
connectDB()
  .then(() => {
    console.log('MongoDB connected...');

    // Escuchar en el puerto 3000
    const PORT = process.env.PORT || 3000;
    httpsServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err.message);
    process.exit(1);
  });
