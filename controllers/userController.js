const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const crypto = require("crypto");
const transporter = require("../config/nodemailer");

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

// Register User
exports.register = async (req, res) => {
  const { name, email, password } = req.body;

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

  const referralCode = await generateReferralCode();

  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: "User already exists" });

    user = new User({ name, email, password, referralCode });
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    const payload = { id: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ msg: "Server Error" });
    console.log(err);
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
    const referralLink = `${process.env.CLIENT_NAME}/register?ref=${user.referralCode}`;

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
    const referralLink = `${process.env.CLIENT_NAME}/register?ref=${user.referralCode}`;
    const referredUsers = await UserModel.find({ codeReferredBy: usersCode });

    res.json({ referralLink, referredUsers });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Track referral
exports.trackReferral = async (req, res) => {
  try {
    const { referralCode } = req.body;
    const referringUser = await UserModel.findOne({ referralCode });

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
    ).select('-password -resetPasswordToken -resetPasswordExpires');

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ msg: 'Error updating user', error: error.message });
  }
};

// Change password (authenticated)
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Current password is incorrect' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.status(200).json({ msg: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ msg: 'Error changing password', error: error.message });
  }
};