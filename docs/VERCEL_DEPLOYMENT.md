# Vercel Deployment Guide

This guide explains how to deploy your Node.js Express backend to Vercel.

## Prerequisites

1. A Vercel account (sign up at [vercel.com](https://vercel.com))
2. Vercel CLI installed (optional, for command-line deployment)

## Project Structure

The project is configured for Vercel with:
- `vercel.json` - Vercel configuration file
- `api/index.js` - Serverless function entry point for Vercel
- `src/server.js` - Express app (works for both local and Vercel)

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Push your code to GitHub/GitLab/Bitbucket**
   - Make sure all changes are committed and pushed

2. **Import Project to Vercel**
   - Go to [vercel.com](https://vercel.com) and log in
   - Click "Add New Project"
   - Import your Git repository
   - Vercel will auto-detect the Node.js project

3. **Configure Environment Variables**
   - In the project settings, go to "Environment Variables"
   - Add your `DATABASE_URL` from Neon:
     ```
     DATABASE_URL=postgresql://neondb_owner:npg_dv5xH2VfFAgJ@ep-floral-surf-a4a6j6xp-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
     ```
   - Optionally add `PORT` (Vercel will set this automatically)
   - Make sure to add it for all environments (Production, Preview, Development)

4. **Deploy**
   - Click "Deploy"
   - Vercel will build and deploy your application
   - Your API will be available at: `https://your-project.vercel.app`

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```
   - Follow the prompts to link your project
   - For production deployment, use:
     ```bash
     vercel --prod
     ```

4. **Set Environment Variables**
   ```bash
   vercel env add DATABASE_URL
   ```
   - Paste your DATABASE_URL when prompted
   - Select environments (Production, Preview, Development)

## Environment Variables

You need to set these environment variables in Vercel:

### Required Variables:

- `DATABASE_URL` - Your PostgreSQL connection string (Neon, Supabase, etc.)
  ```
  postgresql://user:password@host:port/database?sslmode=require
  ```

- `JWT_SECRET` - Secret key for JWT token signing and verification
  ```
  Generate a strong random string (e.g., use: openssl rand -base64 32)
  ```

### Optional Variables (for email functionality):

- `SMTP_HOST` - SMTP server host (default: smtp.gmail.com)
- `SMTP_PORT` - SMTP port (default: 587)
- `EMAIL_USER` - Email address for sending emails
- `EMAIL_PASS` - Email password or app password (for Gmail, use App Password)

### Setting Environment Variables:

1. Go to your project in Vercel dashboard
2. Settings → Environment Variables
3. Add each variable for all environments (Production, Preview, Development)
4. Click "Save" after adding each variable

**Important:** Make sure to add `JWT_SECRET` with a strong random value for production!

## API Endpoints

After deployment, your API will be available at:

- Production: `https://your-project.vercel.app`
- Preview (per branch): `https://your-project-git-branch.vercel.app`

### Available Endpoints:

- `GET /health` - Health check
- `GET /api/constants` - Get all constants
- `GET /api/constants/:id` - Get constant by ID
- `POST /api/constants` - Create constant
- `PUT /api/constants/:id` - Update constant
- `DELETE /api/constants/:id` - Delete constant
- `GET /api/user-input` - Get all user inputs
- `GET /api/user-input/:id` - Get user input by ID
- `POST /api/user-input` - Create user input
- `PUT /api/user-input/:id` - Update user input
- `DELETE /api/user-input/:id` - Delete user input

## Testing Deployment

1. **Health Check**
   ```bash
   curl https://your-project.vercel.app/health
   ```

2. **Test Constants Endpoint**
   ```bash
   curl https://your-project.vercel.app/api/constants
   ```

## Important Notes

1. **Database Connection Pooling**: The connection pool in `src/db.js` works well with Vercel's serverless functions. Each function invocation may create a new pool, but connections are managed efficiently.

2. **Cold Starts**: Serverless functions may experience cold starts (initial latency) on first request after inactivity. This is normal for serverless platforms.

3. **Timeout Limits**: Vercel has execution time limits:
   - Hobby plan: 10 seconds
   - Pro plan: 60 seconds
   - Enterprise: 300 seconds

4. **Local Development**: The app still works locally with `npm run dev` or `npm start`

## Troubleshooting

### Connection Issues
- Verify `DATABASE_URL` is set correctly in Vercel environment variables
- Check that Neon database allows connections from Vercel's IP addresses
- Ensure SSL mode is enabled (`?sslmode=require` in connection string)

### Build Errors
- Check Vercel build logs in the dashboard
- Ensure all dependencies are in `package.json`
- Verify Node.js version compatibility

### Function Timeouts
- Optimize database queries
- Consider using Vercel Pro plan for longer timeouts
- Implement connection pooling properly (already done in `src/db.js`)

## Updates and Redeployment

- Every push to your main branch automatically triggers a production deployment
- Pull requests create preview deployments
- You can also manually redeploy from the Vercel dashboard

## Support

- Vercel Documentation: https://vercel.com/docs
- Vercel Discord: https://vercel.com/discord

