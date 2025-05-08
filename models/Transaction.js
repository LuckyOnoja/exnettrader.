const mongoose = require("mongoose");
const mongoosePaginate = require('mongoose-paginate-v2');

const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  type: { 
    type: String, 
    enum: ["deposit", "withdrawal", "investment", "payout"], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ["pending", "completed", "failed"], 
    default: "pending" 
  },
  paymentMethod: { 
    type: String, 
    enum: ["bitcoin", "ethereum", "usdt", null], 
    default: null 
  },
  walletAddress: { 
    type: String 
  },
  transactionHash: { 
    type: String 
  },
  proofImage: { 
    type: String 
  }, // URL to the uploaded proof
  adminNotes: { 
    type: String 
  },
  investmentPlan: { 
    type: String, 
    enum: ["basic", "premium", "elite", null], 
    default: null 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date 
  },
  completedAt: { 
    type: Date 
  }
});

transactionSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Transaction", transactionSchema);