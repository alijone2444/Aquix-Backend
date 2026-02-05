# Vercel Deployment Setup Guide

This guide will help you deploy your Aquix Backend to Vercel.

## Prerequisites

1. A Vercel account ([sign up here](https://vercel.com))
2. Your code pushed to GitHub/GitLab/Bitbucket
3. Database connection string (Neon, Supabase, or other PostgreSQL provider)

## Quick Setup

### 1. Project Structure

The project is already configured with:
- ✅ `vercel.json` - Vercel configuration
- ✅ `api/index.js` - Serverless function entry point
- ✅ `src/server.js` - Express app (works for both local and Vercel)

### 2. Deploy to Vercel

#### Option A: Via Vercel Dashboard (Recommended)

1. **Import Project**
   - Go to [vercel.com](https://vercel.com) and log in
   - Click "Add New Project"
   - Import your Git repository
   - Vercel will auto-detect Node.js

2. **Configure Environment Variables**
   - Go to Settings → Environment Variables
   - Add the following variables:

   **Required:**
   ```
   DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
   JWT_SECRET=your-strong-random-secret-key-here
   ```

   **Optional (for email functionality):**
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-gmail-app-password
   ```

   - Make sure to add them for **all environments** (Production, Preview, Development)
   - Click "Save" after adding each variable

3. **Deploy**
   - Click "Deploy"
   - Wait for the build to complete
   - Your API will be live at: `https://your-project.vercel.app`

#### Option B: Via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```
   - Follow the prompts to link your project
   - For production: `vercel --prod`

4. **Set Environment Variables**
   ```bash
   vercel env add DATABASE_URL
   vercel env add JWT_SECRET
   vercel env add SMTP_HOST
   vercel env add SMTP_PORT
   vercel env add EMAIL_USER
   vercel env add EMAIL_PASS
   ```

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `JWT_SECRET` | Secret key for JWT tokens | Generate with: `openssl rand -base64 32` |

### Optional Variables (Email)

| Variable | Description | Default |
|----------|-------------|---------|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `EMAIL_USER` | Email address for sending | - |
| `EMAIL_PASS` | Email password/app password | - |

## Testing Your Deployment

1. **Health Check**
   ```bash
   curl https://your-project.vercel.app/health
   ```
   Expected response: `{"status":"OK","message":"Server is running"}`

2. **Test API Endpoints**
   ```bash
   curl https://your-project.vercel.app/api/auth/login
   ```

## API Endpoints

After deployment, your API will be available at:
- **Production**: `https://your-project.vercel.app`
- **Preview**: `https://your-project-git-branch.vercel.app` (per branch)

### Available Endpoints:

- `GET /health` - Health check
- `POST /api/auth/signup` - User signup
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-otp` - Verify OTP
- `GET /api/admin/user-management` - Get all users (admin only)
- `DELETE /api/admin/user` - Delete user (admin only)
- And more... (see routes in `src/routes/`)

## Important Notes

### Database Connection
- The app uses connection pooling which works well with Vercel's serverless functions
- Make sure your database allows connections from Vercel's IP addresses
- Use SSL mode (`?sslmode=require`) in your connection string

### Cold Starts
- Serverless functions may experience cold starts (initial latency) after inactivity
- This is normal and typically resolves after the first request

### Timeout Limits
- **Hobby plan**: 10 seconds
- **Pro plan**: 60 seconds
- **Enterprise**: 300 seconds

### JWT Secret
- **IMPORTANT**: Generate a strong random secret for production
- Never commit `JWT_SECRET` to version control
- Use different secrets for different environments

## Troubleshooting

### Build Fails
- Check Vercel build logs in the dashboard
- Ensure all dependencies are in `package.json`
- Verify Node.js version compatibility

### Database Connection Errors
- Verify `DATABASE_URL` is set correctly
- Check database firewall settings
- Ensure SSL mode is enabled

### Function Timeouts
- Optimize database queries
- Consider upgrading to Vercel Pro plan
- Check for long-running operations

### Email Not Sending
- Verify email credentials are correct
- For Gmail, use App Password (not regular password)
- Check SMTP settings match your email provider

## Updates and Redeployment

- **Automatic**: Every push to main branch triggers production deployment
- **Preview**: Pull requests create preview deployments automatically
- **Manual**: Redeploy from Vercel dashboard → Deployments → Redeploy

## Support

- Vercel Docs: https://vercel.com/docs
- Vercel Discord: https://vercel.com/discord
- Project Issues: Check your repository's issue tracker

