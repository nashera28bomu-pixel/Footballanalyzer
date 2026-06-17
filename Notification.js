const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  matchId: { type: Number, required: true },
  type: { type: String, enum: ['kickoff', 'goal', 'halftime', 'fulltime', 'result'] },
  sentAt: { type: Date, default: Date.now },
  homeTeam: String,
  awayTeam: String,
  score: String
});

notificationSchema.index({ matchId: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Notification', notificationSchema);
