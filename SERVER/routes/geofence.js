const express = require('express');
const router = express.Router();
const Geofence = require('../models/geofence');

// Create a new geofence
router.post('/', async (req, res) => {
  const { name, coordinates } = req.body;

  if (!name || !coordinates) {
    return res.status(400).json({ error: 'Name and coordinates are required' });
  }

  try {
    const geofence = new Geofence({ name, coordinates });
    await geofence.save();
    res.status(201).json({ message: 'Geofence created successfully', geofence });
  } catch (error) {
    console.error('Error saving geofence:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
