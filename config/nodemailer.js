const nodemailer = require("nodemailer");
const path = require("path");

const transporter = nodemailer.createTransporter({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, 
  },
});

// Function to send an email
const sendEmail = async (to, subject, text) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
    html: `<p>${text}</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
    throw error; 
  }
};

const setupHandlebars = async () => {
  try {
    const hbs = await import("nodemailer-express-handlebars");

    transporter.use(
      "compile",
      hbs.default({
        viewEngine: {
          extName: ".hbs",
          partialsDir: path.resolve("./templates/"),
          defaultLayout: false,
        },
        viewPath: path.resolve("./templates/"),
        extName: ".hbs",
      })
    );

    console.log("Handlebars setup complete.");
  } catch (error) {
    console.error("Error setting up Handlebars:", error);
  }
};


setupHandlebars();


module.exports = {
  transporter,
  sendEmail
};