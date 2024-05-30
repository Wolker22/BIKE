const express = require('express');
const router = express.Router();
const Geofence = require('../models/geofence');

router.post('/', async (req, res) => {
  const { geofenceId, coordinates } = req.body;

  if (!geofenceId || !Array.isArray(coordinates)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  try {
    const newGeofence = new Geofence({ geofenceId, coordinates });
    await newGeofence.save();
    res.status(201).json({ message: 'Geofence created successfully' });
  } catch (error) {
    console.error('Error saving geofence:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
