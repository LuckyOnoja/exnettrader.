const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");
const Transaction = require("../models/Transaction");
const upload = require("../middleware/upload");

const depositController = require("../controllers/depositController");
const withdrawalController = require("../controllers/withdrawalController");
const investmentController = require("../controllers/investmentController");
const adminController = require("../controllers/adminController");

// User routes
router.post(
  "/deposits",
  auth,
  upload.single("proofImage"),
  depositController.createDeposit
);
router.get("/deposits", auth, depositController.getUserDeposits);
router.post("/withdrawals", auth, withdrawalController.createWithdrawal);
router.get("/withdrawals", auth, withdrawalController.getUserWithdrawals);
router.post("/investments", auth, investmentController.createInvestment);
router.get("/investments", auth, investmentController.getUserInvestments);

/**
 * @route GET /api/transactions
 * @desc Get all transactions for the authenticated user
 * @access Private
 */
router.get("/", auth, async (req, res) => {
  try {
    const { limit = 5, sort = "-createdAt" } = req.query;

    // Validate limit is a number
    const parsedLimit = parseInt(limit);
    if (isNaN(parsedLimit)) {
      return res.status(400).json({ error: "Invalid limit parameter" });
    }

    const transactions = await Transaction.find({ userId: req.user.id })
      .sort(sort)
      .limit(parsedLimit)
      .lean();

    // Format the response
    const formattedTransactions = transactions.map((transaction) => ({
      _id: transaction._id,
      type: transaction.type,
      amount: transaction.amount,
      status: transaction.status,
      date: transaction.createdAt,
      ...(transaction.investmentPlan && {
        investmentPlan: transaction.investmentPlan,
      }),
      ...(transaction.paymentMethod && {
        paymentMethod: transaction.paymentMethod,
      }),
    }));

    res.json(formattedTransactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Server error fetching transactions" });
  }
});

// Admin routes
// Add to your transactionRoutes.js
router.get("/admin/all", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", type, status } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { "userId.name": { $regex: search, $options: "i" } },
        { _id: { $regex: search, $options: "i" } },
      ];
    }

    if (type && type !== "all") query.type = type;
    if (status && status !== "all") query.status = status;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: "userId",
      lean: true,
    };

    const result = await Transaction.paginate(query, options);

    res.json({
      transactions: result.docs,
      total: result.totalDocs,
      page: result.page,
      pages: result.totalPages,
    });
  } catch (error) {
    console.error("Error fetching all transactions:", error);
    res.status(500).json({ error: "Server error fetching transactions" });
  }
});

router.get("/admin/deposits", adminController.getDeposits);
router.put("/admin/deposits/approve", adminController.approveDeposit);
router.put("/admin/deposits/reject", adminController.rejectDeposit);
router.get("/admin/withdrawals", adminController.getWithdrawals);
router.put(
  "/admin/withdrawals/approve",
  auth,
  adminController.approveWithdrawal
);
router.put("/admin/withdrawals/reject", adminController.rejectWithdrawal);
router.get("/admin/investments/active", adminController.getActiveInvestments);

/**
 * @route GET /api/transactions/:id
 * @desc Get a single transaction by ID
 * @access Private
 */
router.get("/:id", auth, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id).populate(
      "userId",
      "name email"
    );

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Ensure user can only access their own transactions unless admin
    if (
      !req.user.id === process.env.ADMIN_EMAIL &&
      transaction.userId._id.toString() !== req.user.id
    ) {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    res.json(transaction);
  } catch (error) {
    console.error("Error fetching transaction:", error);
    res.status(500).json({ error: "Server error fetching transaction" });
  }
});

/**
 * @route GET /api/transactions
 * @desc Get transactions with filters
 * @access Private (Admin)
 */
router.get("/user/:id", auth, async (req, res) => {
  try {
    const { userId, limit = 5, type, status } = req.params;
    const query = {};

    if (userId) {
      query.userId = userId;
    }

    if (type) {
      query.type = type;
    }

    if (status) {
      query.status = status;
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate("userId", "name email");

    res.json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/:id/terminate", adminController.terminateInvestment);

module.exports = router;
