const xlsx = require('xlsx');
const path = require('path');
const pool = require('../db');

/**
 * Dual workbook seeder:
 * - Reads Free + Standard excel workbooks (repo root by default)
 * - Parses wide "Metric/Field" sheet format into { companyName: { metricName: value } }
 * - Normalizes metric labels between sheets
 * - Merges by company name (keep first non-empty value)
 * - Writes constants into company_constants
 * - Writes mapped metrics into company_financial_data
 * - Upsert behavior: DELETE existing rows by company_name then INSERT fresh within a transaction
 */

const DEFAULT_FREE_PATH = path.resolve(__dirname, '../../1. Free Version dataset_Jay\'2 inputs_60 dataset.xlsx');
const DEFAULT_STANDARD_PATH = path.resolve(__dirname, '../../2. Standard Version dataset_Jay\'s inputs_60 dataset.xlsx');

function parseArgs(argv) {
  const args = { free: DEFAULT_FREE_PATH, standard: DEFAULT_STANDARD_PATH, prefer: 'standard' };
  for (const raw of argv.slice(2)) {
    const [k, v] = raw.split('=');
    if (!v) continue;
    if (k === '--free') args.free = v;
    if (k === '--standard') args.standard = v;
    if (k === '--freeSheet') args.freeSheet = v;
    if (k === '--standardSheet') args.standardSheet = v;
    if (k === '--prefer') args.prefer = v; // 'standard' | 'free'
  }
  return args;
}

function isNonEmpty(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  return true;
}

function normLabel(label) {
  if (!isNonEmpty(label)) return null;
  if (typeof label !== 'string') return String(label);
  // normalize whitespace + unicode dashes
  return label
    .replace(/\u2013|\u2014/g, '-') // en/em dash to hyphen
    .replace(/\s+/g, ' ')
    .trim();
}

// Alias differences between Free sheet 1 and Standard sheet 2 samples
const METRIC_ALIASES = new Map([
  ['Founder dependency high?', 'Founder dep?'],
  ['Supplier dependency high?', 'Supplier dep?'],
  ['Key staff retention plan?', 'Staff plan?'],
  ['Documentation readiness', 'Documentation'],
  ['Documentation readiness ', 'Documentation'],
  ['Seller flexibility (earn-out/vendor finance)', 'Flexibility?'],
  ['Target timeline', 'Timeline'],
  ['FX rate', 'FX'],
  ['FX Rate', 'FX'],
  ['Rev AVG EUR', 'Rev AVG - Historical'],
  ['EBIT AVG EUR', 'EBIT AVG - Historical'],
  ['EBIT Margin', 'Margin %'],
  ['EBIT CAGR', 'EBIT CAGR %'],
  ['Volatility', 'Volatility %'],
  ['Rev CAGR', 'Rev CAGR %'],
  ['Adj Multiple', 'Adj Mult'],
  ['EV mid (EUR)', 'EV mid'],
  ['EV low (EUR)', 'EV low'],
  ['EV high (EUR)', 'EV high'],
  ['Enterprise Value (Mid-point) (000 EUR)', 'EV mid'],
  ['Low (Calculated) (000 EUR)', 'EV low'],
  ['High (Calculated) (000 EUR)', 'EV high'],
  // Free sheet variants
  ['Industry/Sector', 'Sector'],
  ['Country/Region', 'Country'],
  ['Number of Employees (Optional)', 'Employees'],
  ['Top 3 Customers % (Optional)', 'Top-3 %'],
  ['Annual Revenue', 'Revenue Y3'],
  ['EBIT (Operating Profit)', 'EBIT Y3'],
  ['FX Rate to EUR', 'FX'],
  ['EBIT (EUR)', 'EBIT (EUR)'], // special-case used for constants base fallback
  ['Base EBIT Multiple', 'Base Multiple Factor'],
  ['Calculated Adjusted Multiple', 'Adj Mult'],
  ['Enterprise Value (Mid-point)', 'EV mid'],
  ['Low (Calculated)', 'EV low'],
  ['High (Calculated)', 'EV high'],
  ['Risk Comment', 'Narrative'],
  ['Plausibility Check', 'Valuation Reliability'],
  ['Acquisition Score (0-100)', 'TAPWAY INSTITUTIONAL SCORE'],
  ['Investment Attractiveness — aggregation', 'Investment Attractiveness - aggregation'],
]);

function shouldIgnoreMetric(metricName) {
  const s = normLabel(metricName);
  if (!s) return true;
  // Section headers / labels we never want to treat as metrics
  return /^(tapway global - valuation training dataset|free version.*analysis|standard version.*analysis|user inputs|api-fetched data|calculated fields|backend calculations|backend helpers.*lookups|valuation output)$/i.test(
    s,
  );
}

function normalizeMetricName(metricName) {
  const n = normLabel(metricName);
  if (!n) return null;
  if (shouldIgnoreMetric(n)) return null;
  return METRIC_ALIASES.get(n) || n;
}

/**
 * Clean/convert values:
 * - "12,000,000" -> 12000000
 * - "25%" -> 25
 * - "87772800k EUR" -> 87772800000 (k => *1000)
 * - leaves non-numeric strings as-is
 */
function cleanValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;

  if (typeof value !== 'string') return value;

  const raw = value.trim();
  if (raw.length === 0) return null;

  // Common placeholder / empty-like values
  if (/^(n\/a|na|null|none|-|—)$/i.test(raw)) return null;

  // normalize currency suffixes like " EUR", " USD"
  const noCurrency = raw.replace(/\s*(EUR|USD|GBP|CAD|AUD|INR)\s*$/i, '').trim();

  // strip leading/trailing non-numeric tokens but keep % and k
  let s = noCurrency;

  // percent
  const pctMatch = s.match(/^(-?\d[\d,]*\.?\d*)\s*%$/);
  if (pctMatch) {
    const num = parseFloat(pctMatch[1].replace(/,/g, ''));
    return Number.isFinite(num) ? num : raw;
  }

  // "123k" or "123k EUR" already stripped to "123k"
  const kMatch = s.match(/^(-?\d[\d,]*\.?\d*)\s*[kK]\s*$/);
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(/,/g, ''));
    return Number.isFinite(num) ? num * 1000 : raw;
  }

  // "87772800k EUR" can sometimes come through without the currency stripped if it’s in the middle
  const kCurrencyMatch = s.match(/^(-?\d[\d,]*\.?\d*)\s*[kK]\s*(?:EUR|USD|GBP|CAD|AUD|INR)\s*$/i);
  if (kCurrencyMatch) {
    const num = parseFloat(kCurrencyMatch[1].replace(/,/g, ''));
    return Number.isFinite(num) ? num * 1000 : raw;
  }

  // plain numeric (with commas)
  const numMatch = s.match(/^(-?\d[\d,]*\.?\d*)$/);
  if (numMatch) {
    const num = parseFloat(numMatch[1].replace(/,/g, ''));
    return Number.isFinite(num) ? num : raw;
  }

  return raw;
}

/**
 * Excel date parsing:
 * Excel stores dates as serial numbers (days since 1899-12-30)
 */
function parseExcelDate(value) {
  if (!value) return null;
  if (typeof value === 'number') {
    const excelBaseDate = new Date(1899, 11, 30);
    const date = new Date(excelBaseDate.getTime() + value * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  }
  if (typeof value === 'string') return value.trim();
  return value;
}

function looksLikeHeaderCell(v) {
  const s = normLabel(v);
  if (!s) return false;
  return s.toLowerCase() === 'metric' || s.toLowerCase() === 'field';
}

function findHeaderRow(rawData, maxScanRows = 80) {
  const limit = Math.min(rawData.length, maxScanRows);
  for (let i = 0; i < limit; i++) {
    const row = rawData[i];
    if (!row || row.length < 2) continue;
    if (!looksLikeHeaderCell(row[0])) continue;

    // Need at least one company name in columns 1+
    const companies = [];
    for (let c = 1; c < row.length; c++) {
      const name = normLabel(row[c]);
      if (name) companies.push(name);
    }
    if (companies.length > 0) return { headerRowIndex: i, companies };
  }
  throw new Error('Could not find a header row starting with "Metric" or "Field".');
}

function buildCompanyColumnIndex(headerRow) {
  const companyIndices = new Map();
  for (let i = 1; i < headerRow.length; i++) {
    const name = normLabel(headerRow[i]);
    if (!name) continue;
    // Skip non-company labels that sometimes appear in these sheets
    if (/^(user inputs|api-fetched data|calculated fields|backend calculations|valuation output|backend helpers & lookups|tapway score|tapway institutional score)$/i.test(name)) {
      continue;
    }
    companyIndices.set(name, i);
  }
  return companyIndices;
}

function readWorkbookAsCompanyMetricMap(workbookPath, preferredSheetName) {
  const workbook = xlsx.readFile(workbookPath);
  const sheetName = preferredSheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet not found: "${sheetName}" in ${workbookPath}`);
  }

  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const { headerRowIndex } = findHeaderRow(rawData);
  const headerRow = rawData[headerRowIndex];
  const companyIndices = buildCompanyColumnIndex(headerRow);

  const companiesData = {};
  for (const companyName of companyIndices.keys()) {
    companiesData[companyName] = {};
  }

  for (let r = headerRowIndex + 1; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row || row.length === 0) continue;

    const metricRaw = row[0];
    const metric = normalizeMetricName(metricRaw);
    if (!metric) continue;

    for (const [companyName, colIndex] of companyIndices.entries()) {
      const v = row[colIndex];
      companiesData[companyName][metric] = v === undefined ? null : v;
    }
  }

  return companiesData;
}

function mergeCompanyMapsKeepFirstNonEmpty(target, incoming) {
  const companyKey = (name) => (normLabel(name) || '').toLowerCase();
  const index = new Map(Object.keys(target).map((name) => [companyKey(name), name]));

  for (const [companyName, metrics] of Object.entries(incoming)) {
    const key = companyKey(companyName);
    const targetName = index.get(key) || companyName;

    if (!target[targetName]) {
      target[targetName] = {};
      index.set(key, targetName);
    }

    for (const [metric, value] of Object.entries(metrics)) {
      if (!isNonEmpty(target[targetName][metric]) && isNonEmpty(value)) {
        target[targetName][metric] = value;
      } else if (target[targetName][metric] === undefined) {
        // Ensure key exists (for completeness) even if empty
        target[targetName][metric] = value;
      }
    }
  }
  return target;
}

// Metric name -> company_financial_data column mapping (canonical metric names after normalizeMetricName)
const METRIC_MAP = {
  // Core Info
  Sector: 'sector',
  Country: 'country',
  Currency: 'currency',
  'Val Date': 'val_date',
  Employees: 'employees',

  // Revenue & EBIT History
  'Revenue Y1': 'revenue_y1',
  'Revenue Y2': 'revenue_y2',
  'Revenue Y3': 'revenue_y3',
  'EBIT Y1': 'ebit_y1',
  'EBIT Y2': 'ebit_y2',
  'EBIT Y3': 'ebit_y3',

  // Forecast
  'Revenue F1': 'revenue_f1',
  'Revenue F2': 'revenue_f2',
  'Revenue F3': 'revenue_f3',
  'EBIT F1': 'ebit_f1',
  'EBIT F2': 'ebit_f2',
  'EBIT F3': 'ebit_f3',

  // Balance Sheet
  'Total Debt': 'total_debt',
  'Current Assets': 'current_assets',
  'Current Liabilities': 'current_liabilities',

  // Other Metrics
  'Credit Rating': 'credit_rating',
  'Ownership %': 'ownership_percent',
  'Mgmt Turnover %': 'mgmt_turnover_percent',
  'Litigation?': 'litigation',
  'Top-3 %': 'top_3_percent',
  'Founder dep?': 'founder_dep',
  'Supplier dep?': 'supplier_dep',
  'Staff plan?': 'staff_plan',
  'Audited?': 'audited',
  Documentation: 'documentation',
  'Flexibility?': 'flexibility',
  Timeline: 'timeline',
  FX: 'fx',

  // Calculated/Historical Averages
  'Rev AVG - Historical': 'rev_avg_historical',
  'EBIT AVG - Historical': 'ebit_avg_historical',
  'Margin %': 'margin_percent',
  'EBIT CAGR %': 'ebit_cagr_percent',
  'Volatility %': 'volatility_percent',
  'Rev CAGR %': 'rev_cagr_percent',
  'Debt/EBITDA': 'debt_ebitda',
  'Current Ratio': 'current_ratio',

  // Factors
  'Base Multiple Factor': 'base_multiple_factor',
  'Country Risk Factor': 'country_risk_factor',
  'Size Adjustment Factor': 'size_adjustment_factor',
  'Customer Concentration Adjustment': 'customer_concentration_adjustment',

  // Valuation outputs
  'Adj Mult': 'adj_mult',
  'Norm EBIT': 'norm_ebit',
  'EV mid': 'ev_mid',
  'EV low': 'ev_low',
  'EV high': 'ev_high',

  // Qualitative/Scores
  'Financial Strength': 'financial_strength',
  'Risk Management': 'risk_management',
  'Market Context': 'market_context',
  'Dealability (Size) subscore': 'dealability_size_subscore',
  'Dealability (Documentation) subscore': 'dealability_documentation_subscore',
  'Dealability (Flexibility) subscore': 'dealability_flexibility_subscore',
  'Dealability (Timeline) subscore': 'dealability_timeline_subscore',
  'Dealability Score (0–100)': 'dealability_score',
  'Dealability Score (0-100)': 'dealability_score',
  'Financial Quality': 'financial_quality',
  'Growth Score': 'growth_score',
  'Data Completeness': 'data_completeness',
  'Sector Context': 'sector_context',
  'Investment Attractiveness - aggregation': 'investment_attractiveness',
  'TAPWAY SCORE': 'tapway_score',
  'Valuation Range - Low (85%)': 'valuation_range_low_percent',
  'Valuation Range - High (115%)': 'valuation_range_high_percent',
  'Valuation Reliability': 'valuation_reliability',
  'FX Confidence': 'fx_confidence',
  'Peer Gap %': 'peer_gap_percent',
  'Age Warning': 'age_warning',
  'Inst Bonus': 'inst_bonus',
  'Risk Flags': 'risk_flags',
  'TAPWAY INSTITUTIONAL SCORE': 'tapway_institutional_score',
  Narrative: 'narrative',
};

function buildConstantsPayload(metrics) {
  // base: prefer 'Norm EBIT' else 'EBIT (EUR)' (from Free sheet)
  const baseCandidate = isNonEmpty(metrics['Norm EBIT']) ? metrics['Norm EBIT'] : metrics['EBIT (EUR)'];

  return {
    base: cleanValue(baseCandidate),
    country: normLabel(metrics.Country),
    risk_factor: cleanValue(metrics['Country Risk Factor']),
    size: cleanValue(metrics['Dealability (Size) subscore']),
    adjustment_factor: cleanValue(metrics['Size Adjustment Factor']),
    customer: cleanValue(metrics['Top-3 %']),
    customer_concentration_adjustment: cleanValue(metrics['Customer Concentration Adjustment']),
  };
}

function buildFinancialInsert(companyName, metrics) {
  const columns = ['company_name'];
  const values = [companyName];

  for (const [metricName, dbCol] of Object.entries(METRIC_MAP)) {
    if (!Object.prototype.hasOwnProperty.call(metrics, metricName)) continue;

    let v = metrics[metricName];
    if (v === undefined) continue;

    if (dbCol === 'val_date') {
      v = parseExcelDate(v);
    } else {
      v = cleanValue(v);
    }

    // Keep nulls out of the insert list (so we only insert what we actually have)
    if (v === null) continue;

    columns.push(dbCol);
    values.push(v);
  }

  const placeholders = values.map((_, i) => `$${i + 1}`);
  const sql = `INSERT INTO company_financial_data (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  return { sql, values };
}

function auditUnmappedMetrics(companyMetricsByCompanyName) {
  const mappedMetrics = new Set(Object.keys(METRIC_MAP));
  const constantsMetrics = new Set([
    'Norm EBIT',
    'EBIT (EUR)',
    'Country',
    'Country Risk Factor',
    'Dealability (Size) subscore',
    'Size Adjustment Factor',
    'Top-3 %',
    'Customer Concentration Adjustment',
  ]);

  const unmapped = new Set();
  for (const metrics of Object.values(companyMetricsByCompanyName)) {
    for (const [metric, rawVal] of Object.entries(metrics)) {
      if (!isNonEmpty(rawVal)) continue;
      if (mappedMetrics.has(metric)) continue;
      if (constantsMetrics.has(metric)) continue;
      unmapped.add(metric);
    }
  }

  if (unmapped.size > 0) {
    const list = Array.from(unmapped).sort();
    console.warn(
      `⚠️  Found ${list.length} metric(s) in Excel that are not mapped to any DB column and will be ignored:\n- ${list
        .slice(0, 100)
        .join('\n- ')}${list.length > 100 ? '\n- ... (truncated)' : ''}`,
    );
  }
}

async function ensureFinancialColumnsExist(client) {
  // These columns are not in older DBs; add them if missing.
  const alterSql = `
    ALTER TABLE company_financial_data
      ADD COLUMN IF NOT EXISTS financial_quality NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS growth_score NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS data_completeness NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS sector_context NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS investment_attractiveness NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS tapway_score NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS valuation_range_low_percent NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS valuation_range_high_percent NUMERIC(10, 2);
  `;
  await client.query(alterSql);
}

async function seedData() {
  const args = parseArgs(process.argv);

  console.log('Reading workbooks...');
  const freeData = readWorkbookAsCompanyMetricMap(args.free, args.freeSheet);
  const standardData = readWorkbookAsCompanyMetricMap(args.standard, args.standardSheet);

  // Merge order matters for keep-first-non-empty:
  // We keep first non-empty values, so parse Free first, then Standard fills blanks (or vice versa).
  // Your choice was keep-first-non-empty; we’ll keep values from the first merged map.
  const merged = {};
  if ((args.prefer || '').toLowerCase() === 'free') {
    mergeCompanyMapsKeepFirstNonEmpty(merged, freeData);
    mergeCompanyMapsKeepFirstNonEmpty(merged, standardData);
  } else {
    mergeCompanyMapsKeepFirstNonEmpty(merged, standardData);
    mergeCompanyMapsKeepFirstNonEmpty(merged, freeData);
  }

  auditUnmappedMetrics(merged);

  const companyNames = Object.keys(merged);
  console.log(`Found ${companyNames.length} companies total.`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Make sure the DB schema can accept all mapped metrics (safe no-op if already present)
    await ensureFinancialColumnsExist(client);

    for (const companyName of companyNames) {
      const metrics = merged[companyName];

      // 1) Upsert semantics: delete existing rows for the company, then insert
      await client.query('DELETE FROM company_constants WHERE company_name = $1', [companyName]);
      await client.query('DELETE FROM company_financial_data WHERE company_name = $1', [companyName]);

      // 2) Insert constants
      const c = buildConstantsPayload(metrics);
      await client.query(
        `
          INSERT INTO company_constants (
            company_name, base, country, risk_factor, size, adjustment_factor, customer, customer_concentration_adjustment
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          companyName,
          c.base,
          c.country,
          c.risk_factor,
          c.size,
          c.adjustment_factor,
          c.customer,
          c.customer_concentration_adjustment,
        ],
      );

      // 3) Insert financial row
      const fin = buildFinancialInsert(companyName, metrics);
      await client.query(fin.sql, fin.values);

      console.log(`Seeded: ${companyName}`);
    }

    await client.query('COMMIT');
    console.log('✅ Dual-workbook seed completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed, rolled back transaction:', err);
    throw err;
  } finally {
    client.release();
  }
}

seedData()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
  .finally(async () => {
    try {
      await pool.end();
    } catch (_) {
      // ignore
    }
  });

