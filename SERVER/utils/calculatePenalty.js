const Geofence = require("../models/geofence");

async function checkGeofences(username, location) {
  const geofences = await Geofence.find();
  let violated = false;

  geofences.forEach(geofence => {
    const distance = getDistance(location, geofence.coordinates);
    if (distance > geofence.radius) {
      violated = true;
    }
  });

  return { violated };
}

function getDistance(loc1, loc2) {
  const R = 6371e3; // metres
  const φ1 = loc1.lat * Math.PI/180;
  const φ2 = loc2[1] * Math.PI/180;
  const Δφ = (loc2[1] - loc1.lat) * Math.PI/180;
  const Δλ = (loc2[0] - loc1.lng) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  const d = R * c; // in metres
  return d;
}

module.exports = { checkGeofences };
