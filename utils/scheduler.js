const cron = require("node-cron");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

const investmentPlans = {
  basic: { 
    dailyRate: 0.12 / 365, 
    duration: 7,
    label: "Basic (12% Annual)" 
  },
  premium: { 
    dailyRate: 0.18 / 365, 
    duration: 14,
    label: "Premium (18% Annual)" 
  },
  elite: { 
    dailyRate: 0.24 / 365, 
    duration: 30,
    label: "Elite (24% Annual)" 
  }
};

// Schedule the task to run daily at midnight
cron.schedule("0 0 * * *", async () => {
  try {
    console.log("Running daily investment payout...");
    
    // 1. Find all ACTIVE investments (status: "completed")
    const activeInvestments = await Transaction.find({
      type: "investment",
      status: "completed", 
      investmentPlan: { $in: ["basic", "premium", "elite"] }
    });

    let processedCount = 0;
    let totalPayout = 0;
    let maturedInvestments = 0;

    for (const investment of activeInvestments) {
      try {
        const user = await User.findById(investment.userId);
        if (!user) continue;

        const plan = investmentPlans[investment.investmentPlan];
        if (!plan) continue;

        // Calculate days since investment started
        const daysInvested = Math.floor(
          (new Date() - investment.createdAt) / (1000 * 60 * 60 * 24)
        );

        // Check if investment has matured
        if (daysInvested >= plan.duration) {
          // Final payout (principal + total earnings)
          const finalPayout = investment.amount * (1 + (plan.dailyRate * plan.duration));
          
          // Update user balance
          user.balance += finalPayout;
          user.totalEarnings = (user.totalEarnings || 0) + finalPayout;
          
          // Mark investment as "matured" 
          investment.status = "matured";
          await investment.save();
          
          // Record payout transaction
          const payoutTransaction = new Transaction({
            userId: user._id,
            amount: finalPayout,
            type: "payout",
            status: "completed",
            investmentPlan: investment.investmentPlan
          });

          await payoutTransaction.save();
          maturedInvestments++;
        } else {
          // Regular daily earnings
          const dailyEarnings = investment.amount * plan.dailyRate;
          
          // Update user balance
          user.balance += dailyEarnings;
          user.totalEarnings = (user.totalEarnings || 0) + dailyEarnings;
          
          // Record daily earnings (optional)
          const earningTransaction = new Transaction({
            userId: user._id,
            amount: dailyEarnings,
            type: "earning",
            status: "completed",
            investmentPlan: investment.investmentPlan
          });

          await earningTransaction.save();
          processedCount++;
          totalPayout += dailyEarnings;
        }

        await user.save();
      } catch (error) {
        console.error(`Error processing investment ${investment._id}:`, error);
      }
    }

    console.log(`
      Daily payout completed. 
      Processed ${processedCount} investments, 
      Matured ${maturedInvestments} investments, 
      Total payout: $${totalPayout.toFixed(2)}
    `);
  } catch (error) {
    console.error("Error in daily investment cron job:", error);
  }
});

console.log("Daily investment payout scheduler initialized.");