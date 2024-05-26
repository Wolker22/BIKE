const express = require("express");
const router = express.Router();
const Geofence = require("../models/geofence");

router.post("/", async (req, res) => {
  try {
    const geofence = new Geofence(req.body);
    await geofence.save();
    res.status(201).send(geofence);
  } catch (error) {
    res.status(400).send({ error: "Error creating geofence" });
  }
});

module.exports = router;
