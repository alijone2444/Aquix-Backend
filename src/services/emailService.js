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
  // Check if email credentials are configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Email credentials not configured! EMAIL_USER or EMAIL_PASS is missing.');
    throw new Error('Email service not configured. Please set EMAIL_USER and EMAIL_PASS environment variables.');
  }

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

/**
 * Send Password Reset OTP email
 */
const sendPasswordResetEmail = async (email, otpCode, fullName) => {
  try {
    console.log('sendPasswordResetEmail called with:', { email, otpCode, fullName });
    console.log('Email config check:', {
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_PORT: process.env.SMTP_PORT,
      EMAIL_USER: process.env.EMAIL_USER ? 'SET' : 'NOT SET',
      EMAIL_PASS: process.env.EMAIL_PASS ? 'SET' : 'NOT SET'
    });
    
    const transporter = createTransporter();
    console.log('Transporter created successfully');

    const mailOptions = {
      from: 'noreply@aquix.com',
      to: email,
      subject: 'Password Reset - OTP Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hello ${fullName || 'User'},</p>
          <p>We received a request to reset your password. Please use the following OTP code to reset your password:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #dc3545; font-size: 32px; margin: 0; letter-spacing: 5px;">${otpCode}</h1>
          </div>
          <p>This OTP will expire in 10 minutes.</p>
          <p><strong>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</strong></p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">This is an automated email, please do not reply.</p>
        </div>
      `,
      text: `
        Password Reset Request
        
        Hello ${fullName || 'User'},
        
        We received a request to reset your password. Please use the following OTP code to reset your password:
        
        OTP Code: ${otpCode}
        
        This OTP will expire in 10 minutes.
        
        If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

module.exports = {
  sendOTPEmail,
  sendPasswordResetEmail,
  createTransporter,
};

