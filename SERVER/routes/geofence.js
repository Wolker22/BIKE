const express = require('express');
const router = express.Router();
const Geofence = require('../models/Geofence');

router.post('/geofence', async (req, res) => {
  const { geofenceId, name, coordinates } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Name is required' });
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
