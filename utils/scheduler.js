const cron = require("node-cron");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const mongoose = require("mongoose");

const investmentPlans = {
  basic: {
    dailyRate: 0.10, // 10% daily
    duration: 7,
    label: "Basic (10% Daily)",
    minAmount: 100,
    maxAmount: 1500,
  },
  premium: {
    dailyRate: 0.50, // 50% daily
    duration: 7,
    label: "Premium (50% Daily)",
    minAmount: 1000,
    maxAmount: 10000,
  },
  elite: {
    dailyRate: 0.20, // 20% daily
    duration: 7,
    label: "Elite (20% Daily)",
    minAmount: 500,
    maxAmount: 1000000,
  },
};

// ---------- DISTRIBUTED LOCK ----------
const LOCK_KEY = "investment_payout_lock";
const LOCK_TTL = 60 * 10; // 10 minutes

/**
 * Acquire a distributed lock using MongoDB.
 * Returns true if lock was acquired, false otherwise.
 */
async function acquireLock(db) {
  try {
    const now = Date.now();
    const expiresAt = new Date(now + LOCK_TTL * 1000);

    const result = await db.collection("locks").findOneAndUpdate(
      { _id: LOCK_KEY },
      { $setOnInsert: { expiresAt } },
      {
        upsert: true,
        returnDocument: "after",
      }
    );

    // If the document was just inserted → we own the lock
    const wasInserted = result.lastErrorObject?.upserted;
    if (wasInserted) {
      console.log("Payout lock acquired.");
      return true;
    }

    // If existing lock hasn't expired, we don't get it
    const existing = result.value;
    if (existing && existing.expiresAt > new Date()) {
      console.log("Payout lock held by another instance. Skipping.");
      return false;
    }

    // Lock expired → try to take it
    const updateResult = await db.collection("locks").findOneAndUpdate(
      { _id: LOCK_KEY, expiresAt: { $lt: new Date() } },
      { $set: { expiresAt } },
      { returnDocument: "after" }
    );

    const acquired = !!updateResult.value;
    if (acquired) console.log("Payout lock acquired (stale lock cleared).");
    return acquired;
  } catch (err) {
    console.error("Error acquiring payout lock:", err);
    return false;
  }
}

// -----------------------------------------------------------------
// Run cron ONLY when this file is executed directly (not on import/reload)
if (require.main === module) {
  console.log("Daily payout scheduler initialized. Next run: 00:00 UTC");

  cron.schedule("0 0 * * *", async () => {
    console.log("Cron triggered: Running daily payout job...");
    await runPayout();
  });
}

/**
 * Main payout runner
 */
async function runPayout() {
  const db = mongoose.connection.db;
  const lockAcquired = await acquireLock(db);
  if (!lockAcquired) return;

  console.log("Starting daily payout processing...");

  let dailyCount = 0;
  let maturedCount = 0;
  let totalDailyPayout = 0;
  let totalMaturedPayout = 0;

  try {
    const activeUsers = await User.find({
      investmentPlan: { $in: ["basic", "premium", "elite"] },
      investmentBalance: { $gt: 0 },
    }).lean(); // lean() for performance

    console.log(`Found ${activeUsers.length} users with active investments.`);

    for (const user of activeUsers) {
      try {
        await processUser(user, {
          dailyCount,
          maturedCount,
          totalDailyPayout,
          totalMaturedPayout,
        });
      } catch (err) {
        console.error(`Failed to process user ${user._id}:`, err.message);
        // Continue with next user
      }
    }
  } catch (err) {
    console.error("Critical error in payout job:", err);
  } finally {
    // Always release lock
    try {
      await db.collection("locks").deleteOne({ _id: LOCK_KEY });
      console.log("Payout lock released.");
    } catch (err) {
      console.error("Failed to release lock:", err);
    }

    console.log(`
      Daily Payout Summary:
      → Daily earnings paid to: ${dailyCount} users ($${totalDailyPayout.toFixed(2)})
      → Investments matured: ${maturedCount} ($${totalMaturedPayout.toFixed(2)})
      → Job completed at: ${new Date().toISOString()}
    `);
  }

  // Inner function to mutate counters
  async function processUser(user, counters) {
    const userId = user._id;
    const plan = investmentPlans[user.investmentPlan];
    if (!plan) {
      console.warn(`User ${userId} has invalid plan: ${user.investmentPlan}`);
      return;
    }

    const now = new Date();
    const startDate = user.investmentStartDate;
    const daysInvested = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Load full user document for updates
    const fullUser = await User.findById(userId);
    if (!fullUser) return;

    // === DAILY PAYOUT ===
    const lastPayoutDate = fullUser.lastDailyPayout
      ? new Date(fullUser.lastDailyPayout.getFullYear(), fullUser.lastDailyPayout.getMonth(), fullUser.lastDailyPayout.getDate())
      : null;

    if (!lastPayoutDate || lastPayoutDate < today) {
      const dailyEarnings = parseFloat((fullUser.investmentBalance * plan.dailyRate).toFixed(8));

      fullUser.balance += dailyEarnings;
      fullUser.totalEarnings += dailyEarnings;
      fullUser.lastDailyPayout = now;

      await Transaction.create({
        userId: fullUser._id,
        amount: dailyEarnings,
        type: "payout",
        status: "completed",
        investmentPlan: fullUser.investmentPlan,
      });

      counters.dailyCount++;
      counters.totalDailyPayout += dailyEarnings;
    }

    // === MATURITY CHECK ===
    if (daysInvested >= plan.duration) {
      const principal = fullUser.investmentBalance;
      const totalInterest = parseFloat((principal * plan.dailyRate * plan.duration).toFixed(8));
      const finalPayout = principal + totalInterest;

      fullUser.balance += finalPayout;
      fullUser.totalEarnings += totalInterest;

      // Reset investment state
      fullUser.investmentBalance = 0;
      fullUser.investmentPlan = null;
      fullUser.investmentStartDate = null;
      fullUser.lastDailyPayout = null;

      // Mark original investment as matured
      await Transaction.updateOne(
        {
          userId: fullUser._id,
          type: "investment",
          status: "completed",
        },
        { status: "matured", completedAt: now }
      );

      // Record final payout
      await Transaction.create({
        userId: fullUser._id,
        amount: finalPayout,
        type: "payout",
        status: "completed",
        investmentPlan: fullUser.investmentPlan, // null now, but safe
      });

      counters.maturedCount++;
      counters.totalMaturedPayout += finalPayout;
    }

    await fullUser.save();
  }
}

// Export for testing or manual trigger
module.exports = { runPayout, investmentPlans };