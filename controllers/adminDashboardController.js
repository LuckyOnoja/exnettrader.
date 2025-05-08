const User = require("../models/User");
const Transaction = require("../models/Transaction");
const transporter = require("../config/nodemailer");

exports.getDashboardStats = async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments();

    // Get active users (users with investments)
    const activeUsers = await User.countDocuments({
      investmentBalance: { $gt: 0 },
    });

    // Get total deposits
    const totalDeposits = await Transaction.aggregate([
      { $match: { type: "deposit", status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Get total withdrawals
    const totalWithdrawals = await Transaction.aggregate([
      { $match: { type: "withdrawal", status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Get pending transactions
    const pendingDeposits = await Transaction.countDocuments({
      type: "deposit",
      status: "pending",
    });

    const pendingWithdrawals = await Transaction.countDocuments({
      type: "withdrawal",
      status: "pending",
    });

    // Recent transactions
    const recentTransactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("userId", "name email");

    res.json({
      stats: {
        totalUsers,
        activeUsers,
        totalDeposits: totalDeposits[0]?.total || 0,
        totalWithdrawals: totalWithdrawals[0]?.total || 0,
        pendingDeposits,
        pendingWithdrawals,
      },
      recentTransactions,
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({
      error: "Server error fetching dashboard stats",
    });
  }
};

exports.sendNewsletter = async (req, res) => {
  try {
    const { subject, content } = req.body;

    // Get all users
    const users = await User.find({}, "email name");

    if (!users || users.length === 0) {
      return res.status(400).json({ error: "No users found" });
    }

    // Creating a simple text version by removing HTML tags
    const textContent = content.replace(/<[^>]*>?/gm, "");

    // Email sending configuration
    const BATCH_SIZE = 10; 
    const DELAY_MS = 1000;
    let successfulSends = 0;
    const failedEmails = [];

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map((user) => {
          return new Promise((resolve) => {
            transporter.sendMail(
              {
                from: `"Valid Trades Investment" <${process.env.EMAIL_USER}>`,
                to: user.email,
                subject: subject,
                html: content,
                text: textContent,
              },
              (error, info) => {
                if (error) {
                  console.error(`Error sending to ${user.email}:`, error);
                  failedEmails.push(user.email);
                } else {
                  console.log(`Sent to ${user.email}:`, info.response);
                  successfulSends++;
                }
                resolve();
              }
            );
          });
        })
      );

      // Add delay between batches if not last batch
      if (i + BATCH_SIZE < users.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }

    return res.status(200).json({
      message: `Newsletter sent to ${successfulSends} users`,
      failedCount: failedEmails.length,
      total: users.length,
    });
  } catch (error) {
    console.error("Newsletter error:", error);
    return res.status(500).json({
      error: "Error sending newsletter",
      details: error.message,
    });
  }
};
