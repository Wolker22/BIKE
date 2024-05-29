const mongoose = require("mongoose");

const geofenceSchema = new mongoose.Schema({
  geofenceId: { type: String, required: true },
  coordinates: { type: Array, required: true }
});

const Geofence = mongoose.model("Geofence", geofenceSchema);

module.exports = Geofence;
