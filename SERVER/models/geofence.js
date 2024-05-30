const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const geofenceSchema = new Schema({
  geofenceId: { type: String, required: true },
  name: { type: String, required: true },
  coordinates: { type: [{ lat: Number, lng: Number }], required: true }
});

module.exports = mongoose.model('Geofence', geofenceSchema);
