const nodemailer = require("nodemailer");
const path = require("path");

const transporter = nodemailer.createTransport({
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
  }
};



// Dynamically import nodemailer-express-handlebars
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

// Call the async function to set up Handlebars
setupHandlebars();

module.exports = {
  transporter,
  sendEmail
};
