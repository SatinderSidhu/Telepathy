const nodemailer = require('nodemailer');

let transporter = null;

function isSmtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

function getTransporter() {
  if (!transporter && isSmtpConfigured()) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: parseInt(process.env.SMTP_PORT, 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function sendPasswordResetEmail(toEmail, resetUrl) {
  if (isSmtpConfigured()) {
    const transport = getTransporter();
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: 'Password Reset Request',
      text: `You requested a password reset. Click the link below to reset your password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, please ignore this email.`,
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires in 1 hour. If you did not request this, please ignore this email.</p>
      `,
    });
    console.log(`Password reset email sent to ${toEmail}`);
  } else {
    console.log('============================================================');
    console.log('PASSWORD RESET LINK (SMTP not configured)');
    console.log(`Email: ${toEmail}`);
    console.log(`Link:  ${resetUrl}`);
    console.log('============================================================');
  }
}

module.exports = { sendPasswordResetEmail };
