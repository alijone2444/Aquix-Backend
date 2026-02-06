const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const constantsRoutes = require('./routes/constants');
const userInputRoutes = require('./routes/userInput');
const companiesRoutes = require('./routes/companies');
const queryRoutes = require('./routes/query');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/constants', constantsRoutes);
app.use('/api/user-input', userInputRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/query', queryRoutes);
app.use('/api/valuations', require('./routes/valuations'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Export app for use in serverless environments (Vercel)
module.exports = app;

// Only start server if not in serverless environment (for local development)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

