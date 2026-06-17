const mongoose = require('mongoose');

// Add referral fields to User model dynamically
const referralSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  referralCode: { type: String, unique: true },
  referredBy: { type: Number, default: null },
  referralCount: { type: Number, default: 0 },
  // Unlocked features based on referral count
  unlockedTiers: { type: Number, default: 0 }, // 0=basic, 1=silver(3refs), 2=gold(7refs), 3=legend(15refs)
  createdAt: { type: Date, default: Date.now }
});

const Referral = mongoose.model('Referral', referralSchema);

// Tier definitions
const TIERS = {
  0: {
    name: 'Basic',
    emoji: '⚪',
    features: ['Fixtures', 'Live Scores', 'Group Standings', 'Results'],
    refs: 0
  },
  1: {
    name: 'Silver',
    emoji: '🥈',
    features: ['+ Daily Hot Picks', '+ Top Odds', '+ Match Predictions'],
    refs: 3,
    unlockMsg: '🥈 *SILVER UNLOCKED\\!* You now have access to Hot Picks, Odds & Predictions\\!'
  },
  2: {
    name: 'Gold',
    emoji: '🥇',
    features: ['+ H2H Analysis', '+ Team News', '+ Live Goal Alerts'],
    refs: 7,
    unlockMsg: '🥇 *GOLD UNLOCKED\\!* Full H2H Analysis, Team News & Live Alerts are yours\\!'
  },
  3: {
    name: 'Legend',
    emoji: '👑',
    features: ['+ Priority AI Predictions', '+ VIP Tips', '+ Early Odds Access'],
    refs: 15,
    unlockMsg: '👑 *LEGEND STATUS\\!* You are now a CymorBot Legend\\! All features unlocked\\!'
  }
};

function generateCode(telegramId) {
  return `CYMOR${telegramId.toString(36).toUpperCase()}`;
}

async function getOrCreateReferral(telegramId) {
  let ref = await Referral.findOne({ telegramId });
  if (!ref) {
    ref = await Referral.create({
      telegramId,
      referralCode: generateCode(telegramId),
      referralCount: 0,
      unlockedTiers: 0
    });
  }
  return ref;
}

async function processReferral(newUserId, referralCode) {
  if (!referralCode) return;

  // Find referrer
  const referrer = await Referral.findOne({ referralCode });
  if (!referrer || referrer.telegramId === newUserId) return null;

  // Check new user hasn't been referred already
  const newUserRef = await Referral.findOne({ telegramId: newUserId });
  if (newUserRef && newUserRef.referredBy) return null;

  // Create/update new user referral doc
  await Referral.findOneAndUpdate(
    { telegramId: newUserId },
    { telegramId: newUserId, referralCode: generateCode(newUserId), referredBy: referrer.telegramId },
    { upsert: true, new: true }
  );

  // Increment referrer count and check tier upgrade
  referrer.referralCount += 1;
  const oldTier = referrer.unlockedTiers;

  // Check tier upgrades
  for (let tier = 3; tier >= 1; tier--) {
    if (referrer.referralCount >= TIERS[tier].refs) {
      referrer.unlockedTiers = Math.max(referrer.unlockedTiers, tier);
      break;
    }
  }

  await referrer.save();

  return {
    referrerId: referrer.telegramId,
    newTier: referrer.unlockedTiers,
    oldTier,
    tierUpgraded: referrer.unlockedTiers > oldTier,
    referralCount: referrer.referralCount
  };
}

async function getUserTier(telegramId) {
  const ref = await Referral.findOne({ telegramId });
  return ref ? ref.unlockedTiers : 0;
}

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function getReferralMessage(ref, botUsername) {
  const link = `https://t.me/${botUsername}?start=ref_${ref.referralCode}`;
  const currentTier = TIERS[ref.unlockedTiers];
  const nextTier = TIERS[ref.unlockedTiers + 1];

  let msg = `🔗 *CYMOR REFERRAL PROGRAM*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `${currentTier.emoji} *Your Status: ${escMd(currentTier.name)}*\n`;
  msg += `👥 *Referrals:* ${ref.referralCount}\n\n`;

  msg += `📋 *YOUR FREE FEATURES:*\n`;
  msg += currentTier.features.map(f => `• ${escMd(f)}`).join('\n');
  msg += '\n\n';

  if (nextTier) {
    const needed = nextTier.refs - ref.referralCount;
    msg += `🚀 *UNLOCK ${escMd(nextTier.emoji + ' ' + nextTier.name)} \\(${needed} more invite${needed !== 1 ? 's' : ''}\\):*\n`;
    msg += nextTier.features.map(f => `• ${escMd(f)}`).join('\n');
    msg += '\n\n';
  } else {
    msg += `👑 *You've unlocked ALL features\\! You're a Legend\\!*\n\n`;
  }

  msg += `🔗 *YOUR INVITE LINK:*\n`;
  msg += `\`${escMd(link)}\`\n\n`;
  msg += `_Share this link with friends\\. When they join, you both level up\\!_\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏆 *Tier Milestones:*\n`;
  msg += `🥈 Silver \\(3 refs\\) → Hot Picks \\+ Odds \\+ Predictions\n`;
  msg += `🥇 Gold \\(7 refs\\) → H2H \\+ Team News \\+ Live Alerts\n`;
  msg += `👑 Legend \\(15 refs\\) → VIP Tips \\+ Priority AI \\+ Early Odds`;

  return { msg, link };
}

// Check if user can access a feature
async function canAccess(telegramId, feature) {
  const adminId = parseInt(process.env.ADMIN_ID);
  if (telegramId === adminId) return true; // Admin always has full access

  const tier = await getUserTier(telegramId);

  const featureRequirements = {
    'fixtures': 0,
    'live': 0,
    'standings': 0,
    'results': 0,
    'upcoming': 0,
    'about': 0,
    'alerts': 0,
    'referral': 0,
    'hotpicks': 1,
    'odds': 1,
    'predictions': 1,
    'h2h': 2,
    'team': 2,
    'notify_goals': 2
  };

  const required = featureRequirements[feature] ?? 0;
  return tier >= required;
}

function getLockedMessage(feature, botUsername) {
  const featureRequirements = {
    'hotpicks': 1, 'odds': 1, 'predictions': 1,
    'h2h': 2, 'team': 2, 'notify_goals': 2
  };
  const requiredTier = TIERS[featureRequirements[feature] || 1];

  return `🔒 *FEATURE LOCKED*\n\n` +
    `This feature requires *${requiredTier.emoji} ${escMd(requiredTier.name)}* tier\\.\n\n` +
    `📨 Invite *${requiredTier.refs} friends* to unlock it\\!\n\n` +
    `Use /referral to get your invite link\\.`;
}

module.exports = {
  Referral,
  TIERS,
  getOrCreateReferral,
  processReferral,
  getUserTier,
  getReferralMessage,
  canAccess,
  getLockedMessage,
  escMd
};
