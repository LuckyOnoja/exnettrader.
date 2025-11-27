const Transaction = require("../models/Transaction");
const User = require("../models/User");

// Get all pending deposits
exports.getDeposits = async (req, res) => {
  try {
    const deposits = await Transaction.find({
      type: "deposit",
    })
      .populate("userId", "name email")
      .sort({ createdAt: -1 });

    res.json(deposits);
  } catch (error) {
    console.error("Get pending deposits error:", error);
    res.status(500).json({
      error: "Server error fetching pending deposits",
    });
  }
};

// Approve a deposit
exports.approveDeposit = async (req, res) => {
  try {
    const { transactionId, notes } = req.body;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction || transaction.type !== "deposit") {
      return res.status(404).json({
        error: "Deposit transaction not found",
      });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({
        error: "Transaction is not pending approval",
      });
    }

    // Update user balance
    const user = await User.findById(transaction.userId);
    user.balance += transaction.amount;

    // Update transaction status
    transaction.status = "completed";
    transaction.adminNotes = notes;
    transaction.completedAt = new Date();
    transaction.updatedAt = new Date();

    await Promise.all([user.save(), transaction.save()]);

    res.json({
      message: "Deposit approved successfully",
      transaction,
    });
  } catch (error) {
    console.error("Approve deposit error:", error);
    res.status(500).json({
      error: "Server error approving deposit",
    });
  }
};

// Reject a deposit
exports.rejectDeposit = async (req, res) => {
  try {
    const { transactionId, notes } = req.body;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction || transaction.type !== "deposit") {
      return res.status(404).json({
        error: "Deposit transaction not found",
      });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({
        error: "Transaction is not pending approval",
      });
    }

    // Update transaction status
    transaction.status = "failed";
    transaction.adminNotes = notes;
    transaction.updatedAt = new Date();

    await transaction.save();

    res.json({
      message: "Deposit rejected successfully",
      transaction,
    });
  } catch (error) {
    console.error("Reject deposit error:", error);
    res.status(500).json({
      error: "Server error rejecting deposit",
    });
  }
};

// Get all pending withdrawals
exports.getWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Transaction.find({
      type: "withdrawal",
    })
      .populate("userId", "name email")
      .sort({ createdAt: -1 });

    res.json(withdrawals);
  } catch (error) {
    console.error("Get pending withdrawals error:", error);
    res.status(500).json({
      error: "Server error fetching pending withdrawals",
    });
  }
};

// Approve a withdrawal
exports.approveWithdrawal = async (req, res) => {
  try {
    const { transactionId, notes, transactionHash } = req.body;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction || transaction.type !== "withdrawal") {
      return res.status(404).json({
        error: "Withdrawal transaction not found",
      });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({
        error: "Transaction is not pending approval",
      });
    }

    // Update transaction status
    transaction.status = "completed";
    transaction.adminNotes = notes;
    transaction.transactionHash = transactionHash;
    transaction.completedAt = new Date();
    transaction.updatedAt = new Date();

    await transaction.save();

    res.json({
      message: "Withdrawal approved successfully",
      transaction,
    });
  } catch (error) {
    console.error("Approve withdrawal error:", error);
    res.status(500).json({
      error: "Server error approving withdrawal",
    });
  }
};

// Reject a withdrawal
exports.rejectWithdrawal = async (req, res) => {
  try {
    const { transactionId, notes } = req.body;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction || transaction.type !== "withdrawal") {
      return res.status(404).json({
        error: "Withdrawal transaction not found",
      });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({
        error: "Transaction is not pending approval",
      });
    }

    // Return funds to user's available balance
    const user = await User.findById(transaction.userId);
    user.availableBalance = (user.availableBalance || 0) + transaction.amount;

    // Update transaction status
    transaction.status = "failed";
    transaction.adminNotes = notes;
    transaction.updatedAt = new Date();

    await Promise.all([user.save(), transaction.save()]);

    res.json({
      message: "Withdrawal rejected successfully",
      transaction,
    });
  } catch (error) {
    console.error("Reject withdrawal error:", error);
    res.status(500).json({
      error: "Server error rejecting withdrawal",
    });
  }
};

// Get all active investments - UPDATED to return transactions
exports.getActiveInvestments = async (req, res) => {
  try {
    // Get active investment transactions instead of users
    const activeInvestments = await Transaction.find({
      type: "investment", 
       $or: [
        { status: "active" },
        { status: "completed" }
      ],
    })
    .populate("userId", "name email")
    .sort({ createdAt: -1 });

    // Transform the data to match your frontend expectations
    const formattedInvestments = activeInvestments.map(transaction => ({
      _id: transaction._id, // This is the transaction ID
      name: transaction.userId?.name,
      email: transaction.userId?.email,
      investmentBalance: transaction.amount,
      investmentPlan: transaction.investmentPlan,
      investmentStartDate: transaction.createdAt,
      userId: transaction.userId?._id,
      totalEarnings: transaction.totalEarnings || 0
    }));

    res.json(formattedInvestments);
  } catch (error) {
    console.error("Get active investments error:", error);
    res.status(500).json({
      error: "Server error fetching active investments",
    });
  }
};

// Get terminate investment
exports.terminateInvestment = async (req, res) => {
  try {

    const investmentId = req.params.id;

    const transaction = await Transaction.findById(investmentId);
    if (!transaction) {
      return res.status(404).json({ error: "Investment not found i know" });
    }

    // Return funds to user's available balance
    const user = await User.findById(transaction.userId);
    user.balance += transaction.amount;
    user.investmentBalance -= transaction.amount;

    // Update investment status
    transaction.status = "terminated";
    transaction.endDate = new Date();

    await Promise.all([user.save(), transaction.save()]);

    res.json({
      message: "Investment terminated successfully",
      transaction,
    });
  } catch (error) {
    console.error("Error terminating investment:", error);
    res.status(500).json({ error: "Server error" });
  }
};
