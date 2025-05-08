const express = require('express');
const router = express.Router();
const {auth} = require("../middleware/auth");
const adminDashboardController = require('../controllers/adminDashboardController');

// Admin dashboard stats route
router.get('/stats', auth, adminDashboardController.getDashboardStats);
router.post('/newsletter/send', auth,  adminDashboardController.sendNewsletter);


module.exports = router;