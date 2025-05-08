const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const cors = require("cors");
const passport = require("passport");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const morgan = require("morgan");

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [process.env.CLIENT_NAME, process.env.LOCAL_CLIENTNAME],
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

// CORS Configuration
const corsOptions = {
  origin: [process.env.CLIENT_NAME, process.env.LOCAL_CLIENTNAME],
};
app.use(cors(corsOptions));

// Increasing the payload size limit for JSON and URL-encoded data
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(morgan("dev"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Initialize Passport
app.use(passport.initialize());
require("./config/passport");

//Giving Access to Authentication Route
const { auth, router } = require("./middleware/auth");
app.use("/api/authenticate", router);

// Routes
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));
app.use("/api/admin/dashboard", require("./routes/adminDashboardRoutes"));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something went wrong!",
  });
});

// Importing the cron job scheduler
require("./utils/scheduler");

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
