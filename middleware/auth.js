const jwt = require("jsonwebtoken");
const express = require("express");
const router = express.Router();

const auth = (req, res, next) => {
  // Get token from header
  const authHeader = req.header("Authorization");

  // Check if token exists
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  // Extract token from "Bearer <token>"
  const token = authHeader.split(" ")[1];

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id };
    next();
  } catch (err) {
    console.error("Token verification error:", err);
    res.status(401).json({ msg: "Token is not valid" });
  }
};

// Route to get new access token using refresh token
router.post("/refresh-token", (req, res) => {
  const { refreshToken } = req.body;
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    console.log('decoded',  decoded.id)
      const payload = { id: decoded.id };
      const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "30d",
      });
    res.send({ accessToken });
  } catch (err) {
    res.status(401).send({ error: "Invalid refresh token." });
  }
});

module.exports = {
  auth,
  router,
};