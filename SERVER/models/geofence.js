const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const GeofenceSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  coordinates: {
    type: [{ lat: Number, lng: Number }],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Geofence = mongoose.model('Geofence', GeofenceSchema);
module.exports = Geofence;
