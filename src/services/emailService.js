const nodemailer = require('nodemailer');

/**
 * Create email transporter
 * Gmail SMTP Configuration:
 * - Server: smtp.gmail.com
 * - Port: 587 (TLS/STARTTLS) or 465 (SSL)
 * - Username: EMAIL_USER from environment
 * - Password: EMAIL_PASS (Gmail App Password) from environment
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587, // 587 for TLS/STARTTLS, 465 for SSL
    secure: (process.env.SMTP_PORT === '465'), // true for port 465 (SSL), false for port 587 (TLS)
    auth: {
      user: process.env.EMAIL_USER, // Gmail address (e.g., alijone2444@gmail.com)
      pass: process.env.EMAIL_PASS, // Gmail App Password
    },
  });
};

/**
 * Send OTP email
 */
const sendOTPEmail = async (email, otpCode, fullName) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: 'noreply@aquix.com',
      to: email,
      subject: 'Verify Your Email - OTP Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Email Verification</h2>
          <p>Hello ${fullName || 'User'},</p>
          <p>Thank you for signing up! Please use the following OTP code to verify your email address:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${otpCode}</h1>
          </div>
          <p>This OTP will expire in 10 minutes.</p>
          <p>If you didn't create an account, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">This is an automated email, please do not reply.</p>
        </div>
      `,
      text: `
        Email Verification
        
        Hello ${fullName || 'User'},
        
        Thank you for signing up! Please use the following OTP code to verify your email address:
        
        OTP Code: ${otpCode}
        
        This OTP will expire in 10 minutes.
        
        If you didn't create an account, please ignore this email.
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('OTP email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw error;
  }
};

module.exports = {
  sendOTPEmail,
  createTransporter,
};

