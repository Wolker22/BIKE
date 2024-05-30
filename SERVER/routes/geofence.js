const express = require('express');
const router = express.Router();
const Geofence = require('../models/geofence');

router.post('/', async (req, res) => {
  const { geofenceId, name, coordinates } = req.body;

  if (!name || !coordinates) {
    return res.status(400).json({ error: 'Name and coordinates are required' });
  }

  const geofence = new Geofence({ geofenceId, name, coordinates });

  try {
    await geofence.save();
    res.status(201).json(geofence);
  } catch (error) {
    console.error('Error saving geofence:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
