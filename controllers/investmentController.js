const Transaction = require("../models/Transaction");
const User = require("../models/User");

const investmentPlans = {
  basic: {
    dailyRate: 0.12 / 365,
    label: "Basic (12% Annual)",
    minAmount: 500,
    maxAmount: 1500,
    duration: 7, // days
  },
  premium: {
    dailyRate: 0.18 / 365,
    label: "Premium (18% Annual)",
    minAmount: 1500,
    maxAmount: 10000,
    duration: 14, // days
  },
  elite: {
    dailyRate: 0.24 / 365,
    label: "Elite (24% Annual)",
    minAmount: 10000,
    maxAmount: 1000000,
    duration: 30, // days
  },
};

// Create new investment
exports.createInvestment = async (req, res) => {
  try {
    const { amount, investmentPlan } = req.body;
    const plan = investmentPlan;
    const userId = req.user.id;
    console.log("body", plan);

    // Validate investment amount against plan
    const selectedPlan = investmentPlans[plan];
    if (!selectedPlan) {
      return res.status(400).json({
        error: "Invalid investment plan",
      });
    }

    if (amount < selectedPlan.minAmount || amount > selectedPlan.maxAmount) {
      return res.status(400).json({
        error: `Amount must be between $${selectedPlan.minAmount} and $${selectedPlan.maxAmount} for this plan`,
      });
    }

    // Check user balance
    const user = await User.findById(userId);
    if (user.balance < amount) {
      return res.status(400).json({
        error: "Insufficient balance for investment",
      });
    }

    // Deduct from balance and add to investment balance
    user.balance -= amount;
    user.investmentBalance = amount;
    user.investmentPlan = plan;
    user.investmentStartDate = new Date();

    // Create investment transaction
    const investment = new Transaction({
      userId,
      amount,
      type: "investment",
      status: "completed", // Investments are auto-approved
      investmentPlan: plan,
    });

    await Promise.all([user.save(), investment.save()]);

    res.status(201).json({
      message: `Investment of $${amount} in ${selectedPlan.label} created successfully`,
      investment,
    });
  } catch (error) {
    console.error("Investment error:", error);
    res.status(500).json({
      error: "Server error processing investment",
    });
  }
};
// Get user investments
exports.getUserInvestments = async (req, res) => {
  try {
    const userId = req.user.id;
    const investments = await Transaction.find({
      userId,
      type: "investment",
    }).sort({ createdAt: -1 });

    if (!investments) {
      return res.status(200).json({
        message: "No investments found",
        investments: [],
      });
    }

    res.json(investments);
  } catch (error) {
    console.error("Get investments error:", error);
    res.status(500).json({
      error: "Server error fetching investments",
      details: error.message,
    });
  }
};
