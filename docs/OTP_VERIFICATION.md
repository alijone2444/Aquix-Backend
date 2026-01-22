# OTP Email Verification System

## Overview

The signup process now includes email verification via OTP (One-Time Password). Users must verify their email before they can log in.

## Flow

1. **Signup** → User registers → Account created with `is_active = false` → OTP sent to email
2. **Verify OTP** → User enters OTP → Account activated (`is_active = true`) → JWT token returned
3. **Login** → Only active users can login

## API Endpoints

### 1. Signup (Updated)
```http
POST /api/auth/signup
Content-Type: application/json

{
  "fullName": "Ali Jone",
  "email": "alijone2333@gmail.com",
  "password": "123456789",
  "company": "alijone",
  "userType": "seller"
}
```

**Response:**
```json
{
  "message": "User created successfully. Please check your email for OTP verification.",
  "user": {
    "id": "uuid",
    "fullName": "Ali Jone",
    "email": "alijone2333@gmail.com",
    "company": "alijone",
    "userType": "seller",
    "isActive": false
  },
  "requiresVerification": true
}
```

**Note:** No JWT token is returned until OTP is verified.

### 2. Verify OTP
```http
POST /api/auth/verify-otp
Content-Type: application/json

{
  "email": "alijone2333@gmail.com",
  "otp": "123456"
}
```

**Response:**
```json
{
  "message": "Email verified successfully. Account activated.",
  "user": {
    "id": "uuid",
    "fullName": "Ali Jone",
    "email": "alijone2333@gmail.com",
    "company": "alijone",
    "isActive": true,
    "roles": [...],
    "permissions": [...]
  },
  "token": "jwt-token"
}
```

### 3. Resend OTP
```http
POST /api/auth/resend-otp
Content-Type: application/json

{
  "email": "alijone2333@gmail.com"
}
```

**Response:**
```json
{
  "message": "OTP has been resent to your email. Please check your inbox."
}
```

### 4. Login (Updated)
If user tries to login before verification:
```json
{
  "error": "Account not verified",
  "message": "Please verify your email with OTP before logging in.",
  "requiresVerification": true
}
```

## Environment Variables

Add these to your `.env` file for email configuration:

```env
# Email Configuration (for Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Or use these alternative names
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@aquix.com

# JWT Secret
JWT_SECRET=your-secret-key-change-in-production
```

### Gmail Setup

1. Enable 2-Step Verification on your Google account
2. Generate an App Password:
   - Go to Google Account → Security → 2-Step Verification → App passwords
   - Create app password for "Mail"
   - Use this password in `SMTP_PASS` or `EMAIL_PASSWORD`

### Other Email Services

For production, consider using:
- **SendGrid**: Professional email service
- **AWS SES**: Amazon Simple Email Service
- **Mailgun**: Transactional email API
- **Postmark**: Email delivery service

Update `src/services/emailService.js` with the appropriate SMTP settings.

## Database Schema

### OTP Table
```sql
CREATE TABLE otps (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  email VARCHAR(255) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## OTP Details

- **Length**: 6 digits
- **Expiry**: 10 minutes
- **Format**: Numeric (e.g., 123456)
- **Storage**: Stored in database with expiry timestamp

## Frontend Integration Example

```javascript
// 1. Signup
const signup = async (userData) => {
  const response = await fetch('http://localhost:3000/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: userData.fullName,
      email: userData.email,
      password: userData.password,
      company: userData.company,
      userType: userData.userType
    })
  });
  
  const data = await response.json();
  
  if (data.requiresVerification) {
    // Show OTP input form
    showOTPForm(data.user.email);
  }
};

// 2. Verify OTP
const verifyOTP = async (email, otp) => {
  const response = await fetch('http://localhost:3000/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp })
  });
  
  const data = await response.json();
  
  if (data.token) {
    // Save token and redirect to dashboard
    localStorage.setItem('token', data.token);
    window.location.href = '/dashboard';
  }
};

// 3. Resend OTP
const resendOTP = async (email) => {
  const response = await fetch('http://localhost:3000/api/auth/resend-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  
  const data = await response.json();
  alert(data.message);
};
```

## Setup Instructions

1. **Update Database Schema:**
   ```bash
   npm run db:init
   ```

2. **Configure Email Settings:**
   Add SMTP credentials to `.env` file

3. **Test Email Service:**
   Make sure your email service is working before deploying

## Security Notes

- OTPs expire after 10 minutes
- Only the most recent unverified OTP is valid
- Old OTPs are not automatically deleted (can be cleaned up with a cron job)
- Users cannot login until email is verified
- OTP is only sent to the registered email address

## Troubleshooting

### Email not sending?
- Check SMTP credentials in `.env`
- For Gmail, make sure you're using App Password, not regular password
- Check firewall/network restrictions
- Verify email service is not blocking the connection

### OTP expired?
- Use `/api/auth/resend-otp` to get a new OTP

### User can't login?
- Check if `is_active = true` in database
- Verify OTP was successfully verified
- Check login endpoint error message

