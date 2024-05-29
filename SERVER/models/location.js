const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const LocationSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  }
});

const Location = mongoose.model('Location', LocationSchema);
module.exports = Location;
