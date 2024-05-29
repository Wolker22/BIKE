const mongoose = require("mongoose");

const geofenceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  coordinates: {
    type: { type: String, default: "Point" },
    coordinates: { type: [Number], required: true },
  },
  radius: { type: Number, required: true },
});

geofenceSchema.index({ coordinates: "2dsphere" });

module.exports = mongoose.model("Geofence", geofenceSchema);
