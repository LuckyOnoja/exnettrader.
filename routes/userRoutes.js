const express = require("express");
const {
  register,
  login,
  requestPasswordReset,
  resetPassword,
  getUsers,
  getUserById,
  getReferralLink,
  getReferralData,
  trackReferral,
  updateUser,
  changePassword,
} = require("../controllers/userController");
const { auth } = require("../middleware/auth");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

const router = express.Router();

// Authentication routes
router.post("/register", register);
router.post("/login", login);
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password/:token", resetPassword);
router.put("/user", auth, updateUser);
router.post("/reset-password", auth, changePassword);

// User routes
router.get("/", auth, getUsers);
router.get("/user", auth, getUserById);

// Referral routes
router.get("/referral-link", auth, getReferralLink);
router.get("/referral-data", auth, getReferralData);
router.post("/track-referral", trackReferral);

/**
 * @route GET /api/users/:id
 * @desc Get user details by ID
 * @access Private (Admin)
 */
router.get("/auser/:id", auth, async (req, res) => {
  try {
    // Check if the requester is admin
    if (!req.user.id === process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: "Access denied. Admins only." });
    }

    const user = await User.findById(req.params.id).select(
      "-password -resetPasswordToken -resetPasswordExpires"
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Add additional user stats if needed
    const userStats = {
      ...user.toObject(),
      activeInvestments: user.investmentBalance > 0 ? 1 : 0,
    };

    res.json(userStats);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Balance adjustment route
router.post("/:id/balance", auth, async (req, res) => {
  try {
    // Check if the requester is admin
    if (!req.user.id === process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: "Access denied. Admins only." });
    }

    const { amount, action, note } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Create transaction record
    const transaction = new Transaction({
      userId: user._id,
      amount: parseFloat(amount),
      type: action === "add" ? "deposit" : "withdrawal",
      status: "completed",
      adminNotes: note || "Balance adjustment by admin",
      method: "admin-adjustment",
    });

    // Update user balance
    if (action === "add") {
      user.balance += parseFloat(amount);
    } else {
      if (user.balance < amount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }
      user.balance -= parseFloat(amount);
    }

    await Promise.all([user.save(), transaction.save()]);

    res.json({
      message: `Balance ${
        action === "add" ? "added" : "subtracted"
      } successfully`,
      newBalance: user.balance,
      transactionId: transaction._id,
    });
  } catch (error) {
    console.error("Error adjusting balance:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// User deletion route
router.delete("/:id", auth, async (req, res) => {
  try {
    // Check if the requester is admin
    if (!req.user.id === process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: "Access denied. Admins only." });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Prevent deletion of admin accounts
    if (user.isAdmin) {
      return res.status(400).json({ error: "Cannot delete admin users" });
    }

    // Check if user has balance or investments
    if (user.balance > 0 || user.investmentBalance > 0) {
      return res.status(400).json({
        error: "Cannot delete user with active balance or investments",
      });
    }

    await User.findByIdAndDelete(req.params.id);

    // Optionally: Delete user's transactions or mark them as deleted
    await Transaction.updateMany(
      { userId: req.params.id },
      { $set: { status: "deleted" } }
    );

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
