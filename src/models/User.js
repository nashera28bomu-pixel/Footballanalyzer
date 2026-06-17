const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: { type: String, default: '' },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  isSubscribed: { type: Boolean, default: true },
  notifyGoals: { type: Boolean, default: true },
  notifyKickoff: { type: Boolean, default: true },
  isFirstVisit: { type: Boolean, default: true },
  joinedAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
