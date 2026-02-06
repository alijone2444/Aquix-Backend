// Vercel serverless function entry point
// This file wraps the Express app for Vercel's serverless environment
const app = require('../src/server');

// Export the Express app directly for Vercel
// Vercel will automatically handle it as a serverless function
module.exports = app;

