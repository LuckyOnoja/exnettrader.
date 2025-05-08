const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String }, 
  country: { type: String }, 
  identityVerified: { type: Boolean, default: false }, 
  twoFactorEnabled: { type: Boolean, default: false }, 
  emailNotifications: { type: Boolean, default: true },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  balance: { type: Number, required: true, default: 0 },
  investmentBalance: { type: Number, default: 0 }, // Tracking invested amount
  referralCode: { type: String, unique: true },
  referralCount: { type: Number, default: 0 },
  codeReferredBy: { type: String },
  investmentPlan: {
    type: String,
    enum: ["basic", "premium", "elite", null],
    default: null,
  },
  investmentStartDate: { type: Date },
  lastDailyPayout: { type: Date },
  totalEarnings: { type: Number, default: 0 }, // total earnings from investment
  createdAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date },
  status: { 
    type: String,
    enum: ["active", "suspended", "pending"],
    default: "active"
  },
  kycDocuments: { 
    idFront: { type: String },
    idBack: { type: String },
    selfie: { type: String },
    verifiedAt: { type: Date }
  }
});

module.exports = mongoose.model("User", userSchema);