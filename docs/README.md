# Aquix Backend

A Node.js backend server using Express and PostgreSQL for managing user inputs and system constants.

## Project Structure

```
backend/
├── src/
│   ├── db.js              ← PostgreSQL connection pool
│   ├── server.js          ← Express app entry point
│   ├── db/
│   │   ├── schema.sql     ← Database schema definitions
│   │   ├── init.js        ← Database initialization utilities
│   │   └── seed.js        ← Sample data seeding
│   ├── routes/
│   │   ├── user.js        ← User routes (example)
│   │   ├── constants.js   ← Constants CRUD operations
│   │   └── userInput.js   ← User input CRUD operations with JOINs
│   ├── utils/
│   │   └── constantLookup.js ← Helper utilities for constant lookups
│   └── scripts/
│       └── initDb.js      ← Database initialization script
├── .env                   ← Environment variables (create manually)
└── package.json           ← Dependencies and scripts
```

## Database Schemas

### Constants Schema
Stores system-defined values like:
- Base EBIT Multiple (by industry)
- Country Risk Factor (by country)
- Size Adjustment Factor (by company size)
- Customer Concentration Adjustment (by concentration level)

### User Input Schema
Stores user-submitted data:
- Industry/Sector
- Country/Region
- Annual Revenue
- EBIT (Operating Profit)
- Currency
- Number of Employees (Optional)
- Top 3 Customers % (Optional)
- Foreign key references to constants

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Database Configuration
DB_USER=your_db_user
DB_HOST=localhost
DB_NAME=your_database_name
DB_PASSWORD=your_db_password
DB_PORT=5432

# Server Configuration
PORT=3000
```

### 3. Initialize Database

Run the database initialization script to create tables:

```bash
npm run db:init
```

To initialize and seed with sample data:

```bash
npm run db:seed
```

Or manually run the SQL file in your PostgreSQL database:

```bash
psql -U your_db_user -d your_database_name -f src/db/schema.sql
```

### 4. Start the Server

Development mode (with nodemon):

```bash
npm run dev
```

Production mode:

```bash
npm start
```

The server will start on `http://localhost:3000` (or the PORT specified in `.env`).

## API Endpoints

### Health Check
- `GET /health` - Check server status

### Constants

- `GET /api/constants` - Get all constants (optional query: `?constant_type=TYPE_NAME`)
- `GET /api/constants/:id` - Get constant by ID
- `GET /api/constants/type/:type/key/:key` - Get constant by type and key
- `POST /api/constants` - Create new constant
- `PUT /api/constants/:id` - Update constant
- `DELETE /api/constants/:id` - Delete constant

**Constant Types:**
- `BASE_EBIT_MULTIPLE` - Base EBIT multiples by industry
- `COUNTRY_RISK_FACTOR` - Risk factors by country
- `SIZE_ADJUSTMENT_FACTOR` - Adjustment factors by company size
- `CUSTOMER_CONCENTRATION_ADJUSTMENT` - Adjustments by customer concentration

### User Input

- `GET /api/user-input` - Get all user inputs with joined constant values
- `GET /api/user-input/:id` - Get user input by ID with joined constant values
- `POST /api/user-input` - Create new user input
- `PUT /api/user-input/:id` - Update user input
- `DELETE /api/user-input/:id` - Delete user input

## Example API Usage

### Create a Constant

```bash
POST /api/constants
Content-Type: application/json

{
  "constant_type": "BASE_EBIT_MULTIPLE",
  "constant_key": "TECHNOLOGY",
  "constant_value": 12.5,
  "description": "Base EBIT Multiple for Technology sector"
}
```

### Create User Input

```bash
POST /api/user-input
Content-Type: application/json

{
  "industry_sector": "Technology",
  "country_region": "US",
  "annual_revenue": 50000000,
  "ebit": 10000000,
  "currency": "USD",
  "number_of_employees": 250,
  "top_3_customers_percent": 35.5,
  "base_ebit_multiple_id": 1,
  "country_risk_factor_id": 2,
  "size_adjustment_factor_id": 3,
  "customer_concentration_adjustment_id": 4
}
```

### Get User Input with Constants

The GET endpoints automatically join and return constant values:

```bash
GET /api/user-input/1
```

Response includes:
- All user input fields
- `base_ebit_multiple_value`, `base_ebit_multiple_key`, `base_ebit_multiple_description`
- `country_risk_factor_value`, `country_risk_factor_key`, `country_risk_factor_description`
- `size_adjustment_factor_value`, `size_adjustment_factor_key`, `size_adjustment_factor_description`
- `customer_concentration_adjustment_value`, `customer_concentration_adjustment_key`, `customer_concentration_adjustment_description`

## Helper Utilities

The `src/utils/constantLookup.js` module provides helper functions:
- `findConstantsForUserInput()` - Automatically find constant IDs based on user input data
- `getSizeCategory()` - Determine size category from annual revenue
- `getCustomerConcentrationCategory()` - Determine concentration category from percentage
- `lookupConstantId()` - Look up constant ID by type and key

## Database Connection

The database connection is configured in `src/db.js` using environment variables. The connection pool is reused across all routes for efficient database access.

## Error Handling

All routes include error handling for:
- Missing required fields (400 Bad Request)
- Invalid foreign key references (400 Bad Request)
- Duplicate constants (409 Conflict)
- Not found resources (404 Not Found)
- Database errors (500 Internal Server Error)

## Future Expansion

The modular structure allows easy addition of:
- New database schemas in `src/db/`
- New API routes in `src/routes/`
- New business logic in `src/utils/`
- Additional middleware and validation

