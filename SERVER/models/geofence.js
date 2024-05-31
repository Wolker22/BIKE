const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const geofenceSchema = new mongoose.Schema({
  geofenceId: {
    type: String,
    required: [true, 'Geofence ID is required'],
    default: uuidv4
  },
  name: {
    type: String,
    required: [true, 'Name is required']
  },
  coordinates: {
    type: Array,
    required: [true, 'Coordinates are required']
  }
});

module.exports = mongoose.model('Geofence', geofenceSchema);
