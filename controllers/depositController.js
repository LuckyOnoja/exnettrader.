const Transaction = require("../models/Transaction");
const User = require("../models/User");

// Create a deposit request
exports.createDeposit = async (req, res) => {
  try {
    const { amount, paymentMethod, walletAddress, transactionHash } = req.body;
    const userId = req.user.id;

    // Validate minimum deposit amount
    if (amount < 100) {
      return res.status(400).json({ 
        error: "Minimum deposit amount is $100" 
      });
    }

    // Create a new deposit transaction
    const deposit = new Transaction({
      userId,
      amount,
      type: "deposit",
      status: "pending",
      paymentMethod,
      walletAddress,
      transactionHash,
      proofImage: req.file ? req.file.path : null
    });

    await deposit.save();

    res.status(201).json({
      message: "Deposit request submitted successfully",
      transaction: deposit
    });
  } catch (error) {
    console.error("Deposit error:", error);
    res.status(500).json({ 
      error: "Server error processing deposit" 
    });
  }
};

// Get user deposits
exports.getUserDeposits = async (req, res) => {
  try {
    const userId = req.user.id;
    const deposits = await Transaction.find({ 
      userId, 
      type: "deposit" 
    }).sort({ createdAt: -1 });

    res.json(deposits);
  } catch (error) {
    console.error("Get deposits error:", error);
    res.status(500).json({ 
      error: "Server error fetching deposits" 
    });
  }
};