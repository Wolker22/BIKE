const express = require("express");
const router = express.Router();
const Location = require("../models/location");

router.post('/', (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'Latitud y longitud son requeridas' });
  }
  // Lógica para manejar las coordenadas recibidas
  res.status(200).json({ message: 'Ubicación recibida' });
});

module.exports = router;


router.post("/end", async (req, res) => {
  try {
    const { username } = req.body;
    const locations = await Location.find({ username }).sort({ createdAt: -1 }).limit(1);
    if (locations.length > 0) {
      const endTime = new Date();
      const startTime = new Date(locations[0].createdAt);
      const timeUsed = Math.floor((endTime - startTime) / (1000 * 60));
      const penaltyAmount = locations.filter(loc => loc.violation).length;
      res.send({ timeUsed, penaltyAmount });
    } else {
      res.send({ timeUsed: 0, penaltyAmount: 0 });
    }
  } catch (error) {
    res.status(500).send({ error: "Error ending session" });
  }
});

module.exports = router;

