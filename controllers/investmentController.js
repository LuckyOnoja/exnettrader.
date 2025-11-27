const Transaction = require("../models/Transaction");
const User = require("../models/User");

const investmentPlans = {
  basic: {
    dailyRate: 0.10, // 10% daily
    label: "Basic (10% Daily)",
    minAmount: 100,
    maxAmount: 1500,
    duration: 7, 
  },
  premium: {
    dailyRate: 0.50, // 50% daily
    label: "Premium (50% Daily)",
    minAmount: 1000,
    maxAmount: 10000,
    duration: 7, 
  },
  elite: {
    dailyRate: 0.20, // 20% daily
    label: "Elite (20% Daily)",
    minAmount: 500,
    maxAmount: 1000000,
    duration: 7, 
  },
};

// new investment
// ---------- CREATE INVESTMENT ----------
exports.createInvestment = async (req, res) => {
  try {
    const { amount, investmentPlan } = req.body;
    const userId = req.user.id;

    const plan = investmentPlans[investmentPlan];
    if (!plan) return res.status(400).json({ error: "Invalid plan" });

    if (amount < plan.minAmount || amount > plan.maxAmount)
      return res.status(400).json({
        error: `Amount must be $${plan.minAmount} – $${plan.maxAmount}`,
      });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.balance < amount)
      return res.status(400).json({ error: "Insufficient balance" });

    // ---- deduct & lock ----
    user.balance -= amount;
    user.investmentBalance = (user.investmentBalance || 0) + amount;
    user.investmentPlan = investmentPlan;
    user.investmentStartDate = new Date();
    user.lastDailyPayout = null;               // reset payout tracker
    user.totalEarnings = user.totalEarnings || 0;

    const investment = new Transaction({
      userId,
      amount,
      type: "investment",
      status: "completed",
      investmentPlan,
    });

    await Promise.all([user.save(), investment.save()]);

    res.status(201).json({ message: "Investment created", investment });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
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

// Export plans for other modules
exports.investmentPlans = investmentPlans;