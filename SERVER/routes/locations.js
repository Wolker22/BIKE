const express = require('express');
const router = express.Router();
const Location = require('../models/location');
const User = require('../models/user');

// Ruta para crear una nueva ubicación
router.post('/', async (req, res) => {
  try {
    const { userId, lat, lng } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const location = new Location({
      user: userId,
      coordinates: { lat, lng }
    });

    await location.save();
    res.status(201).json(location);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Ruta para obtener todas las ubicaciones
router.get('/', async (req, res) => {
  try {
    const locations = await Location.find().populate('user');
    res.status(200).json(locations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
