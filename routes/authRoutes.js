const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Google Auth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false }),
  (req, res) => {
    const payload = { id: req.user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
    // Redirect back to frontend signup page with token
    res.redirect(`${process.env.CLIENT_NAME}/auth?token=${token}`);
  }
);



module.exports = router;