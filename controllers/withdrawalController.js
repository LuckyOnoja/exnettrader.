const Transaction = require("../models/Transaction");
const User = require("../models/User");

// Create withdrawal request
exports.createWithdrawal = async (req, res) => {
  try {
    const { amount, walletAddress, paymentMethod } = req.body;
    const userId = req.user.id;

    // Check user balance
    const user = await User.findById(userId);
    if (user.balance < amount) {
      return res.status(400).json({ 
        error: "Insufficient balance for withdrawal" 
      });
    }

    // Create withdrawal transaction
    const withdrawal = new Transaction({
      userId,
      amount,
      type: "withdrawal",
      status: "pending",
      paymentMethod,
      walletAddress
    });

    await withdrawal.save();

    // Deduct from user's available balance (but not actual balance until approved)
    user.availableBalance = (user.availableBalance || user.balance) - amount;
    await user.save();

    res.status(201).json({
      message: "Withdrawal request submitted successfully",
      transaction: withdrawal
    });
  } catch (error) {
    console.error("Withdrawal error:", error);
    res.status(500).json({ 
      error: "Server error processing withdrawal" 
    });
  }
};

// Get user withdrawals
exports.getUserWithdrawals = async (req, res) => {
  try {
    const userId = req.user.id;
    const withdrawals = await Transaction.find({ 
      userId, 
      type: "withdrawal" 
    }).sort({ createdAt: -1 });

    res.json(withdrawals);
  } catch (error) {
    console.error("Get withdrawals error:", error);
    res.status(500).json({ 
      error: "Server error fetching withdrawals" 
    });
  }
};