const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  penaltyAmount: { type: Number, default: 0 }
});

const User = mongoose.model("User", userSchema);

module.exports = User;
