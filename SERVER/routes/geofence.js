const express = require("express");
const router = express.Router();
const Geofence = require("../models/geofence");

router.post("/", async (req, res) => {
  try {
    const geofence = new Geofence(req.body);
    await geofence.save();
    res.status(201).send(geofence);
  } catch (error) {
    res.status(400).send(error);
  }
});

router.get("/", async (req, res) => {
  try {
    const geofences = await Geofence.find({});
    res.send(geofences);
  } catch (error) {
    res.status(500).send(error);
  }
});

module.exports = router;
