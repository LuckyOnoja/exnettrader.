const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const crypto = require("crypto");
const {transporter,sendEmail } = require("../config/nodemailer");
const Transaction = require("../models/Transaction"); 

async function generateReferralCode() {
  const characters =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const codeLength = 10;
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    let referralCode = "";

    // Generate random code
    for (let i = 0; i < codeLength; i++) {
      referralCode += characters.charAt(
        Math.floor(Math.random() * characters.length)
      );
    }

    // Check if code exists in database
    try {
      const existingUser = await User.findOne({ referralCode });
      if (!existingUser) {
        return referralCode; // Return the unique code
      }
      attempts++;
    } catch (error) {
      console.error("Error checking referral code uniqueness:", error);
      throw new Error("Failed to generate unique referral code");
    }
  }

  // If we couldn't find a unique code after max attempts
  throw new Error(
    "Failed to generate unique referral code after multiple attempts"
  );
}

// Process referral and award bonus to referring user
async function processReferral(referralCode, newUserId) {
  try {
    // Skip if no referral code provided
    if (!referralCode || referralCode.trim() === "") {
      return;
    }

    // Find the referring user by referral code
    const referringUser = await User.findOne({ referralCode });

    if (!referringUser) {
      console.log(`No user found with referral code: ${referralCode}`);
      return;
    }

    // Update referring user's referral count and balance
    referringUser.referralCount += 1;
    referringUser.balance += 20; // Add $20 bonus to the referring user

    // Save the updated referring user
    await referringUser.save();

    // Create a transaction record for the referral bonus
    const transaction = new Transaction({
      userId: referringUser._id,
      amount: 20,
      type: "deposit",
      status: "completed",
      method: "referral-bonus",
      description: `Referral bonus for inviting a new user`,
    });

    await transaction.save();

    // Update the referred user with the code they were referred by
    await User.findByIdAndUpdate(newUserId, { codeReferredBy: referralCode });

    console.log(
      `Referral processed successfully. User ${referringUser._id} received $20 bonus.`
    );
  } catch (error) {
    console.error("Error processing referral:", error);
  }
}

// Register User
exports.register = async (req, res) => {
  const { name, email, password, referralCode } = req.body;

  if (
    process.env.ADMIN_EMAIL === email &&
    process.env.ADMIN_PASSWORD === password
  ) {
    const payload = { id: process.env.ADMIN_EMAIL };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });
    res.json({ token });
    return;
  }

  try {
    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: "User already exists" });

    // Generate a unique referral code for the new user
    const newReferralCode = await generateReferralCode();

    // Create new user
    user = new User({
      name,
      email,
      password,
      referralCode: newReferralCode,
    });

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Save the user
    await user.save();

    // Process referral if provided
    if (referralCode) {
      await processReferral(referralCode, user._id);
    }

    // Generate JWT token
    const payload = { id: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    try {
      const subject = "Welcome to Exnettraders";
      const text = `Thank you for registering!`;
      await sendEmail(user.email, subject, text);
      console.log("Email sent successfully");
    } catch (emailError) {
      console.error("Email sending failed:", emailError.message);
    }

    res.json({ token });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
};

// Login User
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (
    process.env.ADMIN_EMAIL === email &&
    process.env.ADMIN_PASSWORD === password
  ) {
    const payload = { id: process.env.ADMIN_EMAIL };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });
    res.json({ token });
    return;
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "Invalid Credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: "Invalid Credentials" });

    const payload = { id: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ msg: "Server Error" });
  }
};

exports.requestPasswordReset = async (req, res) => {
  const { email } = req.body;
  try {
    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // Generate a reset token
    const resetToken = crypto.randomBytes(20).toString("hex");
    const resetPasswordExpires = Date.now() + 3600000; // 1 hour

    // Save the token and expiration time to the user document
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetPasswordExpires;
    await user.save();

    // Send the reset link to the user's email
    const resetUrl = `http://localhost:3000/auth/reset-password/${resetToken}`;
    const mailOptions = {
      to: user.email,
      from: process.env.EMAIL_USER,
      template: "basic",
      subject: "Password Reset Request",
      text: `You are receiving this because you (or someone else) have requested a password reset for your BANSONGA account.\n\n
             Please click on the following link to reset your password:\n\n
             ${resetUrl}\n\n
             If you did not request this, please ignore this email and your password will remain unchanged.\n`,
    };

    // Send the email
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
      } else {
        console.log("Email sent:", info.response);
      }
    });
    res.json({ msg: "Password reset link sent to your email" });
  } catch (err) {
    res.status(500).json({ msg: "Server Error" });
    console.log("sending email err", err);
  }
};

exports.resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    // Finding the user by the reset token and check if it's still valid
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }, // Checking if the token has not expired
    });

    if (!user) {
      return res.status(400).json({ msg: "Invalid or expired token" });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Clearing the reset token and expiration time
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();
    res.json({ msg: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ msg: "Server Error" });
  }
};

// Controller to fetch all users
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select(
      "-password -resetPasswordToken -resetPasswordExpires"
    );
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ msg: "Error fetching users", error });
  }
};

// Controller to fetch a single user by ID
exports.getUserById = async (req, res) => {
  try {
    // Get basic user data
    const user = await User.findById(req.user.id)
      .select("-password -resetPasswordToken -resetPasswordExpires")
      .lean();

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ msg: "Error fetching user", error: error.message });
  }
};

// Get referral link and count
exports.getReferralLink = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user from the database by _id
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate referral link using user's referral code
    const referralLink = `${process.env.CLIENT_NAME}/auth?ref=${user.referralCode}`;

    res.json({ referralLink, count: user.referralCount });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// Get referral data including referred users
exports.getReferralData = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user from the database by _id
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate referral link using user's referral code
    const usersCode = user.referralCode;
    const referralLink = `${process.env.CLIENT_NAME}/auth?ref=${user.referralCode}`;
    const referredUsers = await User.find({ codeReferredBy: usersCode })
      .select("name email createdAt")
      .lean();

    res.json({
      referralLink,
      referredUsers,
      referralCount: user.referralCount,
      referralBonus: user.referralCount * 20, // Calculate total bonus earned
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Validate referral code
exports.validateReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;

    if (!referralCode) {
      return res
        .status(400)
        .json({ valid: false, msg: "No referral code provided" });
    }

    const referringUser = await User.findOne({ referralCode });

    if (!referringUser) {
      return res
        .status(404)
        .json({ valid: false, msg: "Invalid referral code" });
    }

    res.json({ valid: true, msg: "Valid referral code" });
  } catch (err) {
    console.error("Error validating referral code:", err);
    res.status(500).json({ valid: false, msg: "Server error" });
  }
};

// Track referral
exports.trackReferral = async (req, res) => {
  try {
    const { referralCode } = req.body;
    const referringUser = await User.findOne({ referralCode });

    if (!referringUser) {
      res.status(404).json({ message: "Referring user not found" });
      return;
    }

    referringUser.referralCount++;
    await referringUser.save();
    res.json({ message: "Referral tracked successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update user profile
exports.updateUser = async (req, res) => {
  try {
    const { name, email, phone, country } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, email, phone, country },
      { new: true }
    ).select("-password -resetPasswordToken -resetPasswordExpires");

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ msg: "Error updating user", error: error.message });
  }
};

// Change password (authenticated)
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: "Current password is incorrect" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.status(200).json({ msg: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res
      .status(500)
      .json({ msg: "Error changing password", error: error.message });
  }
};
