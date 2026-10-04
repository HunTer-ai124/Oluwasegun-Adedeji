import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { ColumnMetadata, ColumnType, DataQualitySummary } from '../types';

/**
 * Infer the semantic data type of a column based on its values
 */
export function inferColumnType(values: any[]): ColumnType {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (nonNull.length === 0) return 'text';

  let currencyMatches = 0;
  let numberMatches = 0;
  let dateMatches = 0;
  let booleanMatches = 0;

  const currencyRegex = /^\s*[$€£¥]\s*[\d,]+(\.\d+)?\s*$/;
  const dateRegex = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}|^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/;

  for (const val of nonNull) {
    if (typeof val === 'boolean' || val === 'true' || val === 'false') {
      booleanMatches++;
      continue;
    }

    const str = String(val).trim();

    if (currencyRegex.test(str)) {
      currencyMatches++;
      continue;
    }

    if (typeof val === 'number') {
      numberMatches++;
      continue;
    }

    // Check if clean number
    const num = Number(str.replace(/,/g, ''));
    if (!isNaN(num) && str !== '') {
      numberMatches++;
      continue;
    }

    // Check date
    if (dateRegex.test(str) && !isNaN(Date.parse(str))) {
      dateMatches++;
      continue;
    }
  }

  const threshold = nonNull.length * 0.7;
  if (currencyMatches >= threshold) return 'currency';
  if (booleanMatches >= threshold) return 'boolean';
  if (numberMatches >= threshold) return 'number';
  if (dateMatches >= threshold) return 'date';

  return 'text';
}

/**
 * Analyze all columns in a dataset
 */
export function analyzeColumns(rows: Record<string, any>[]): ColumnMetadata[] {
  if (rows.length === 0) return [];
  const columnNames = Object.keys(rows[0]);

  return columnNames.map((colName) => {
    const values = rows.map((r) => r[colName]);
    const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
    const type = inferColumnType(values);

    let min: number | string | undefined;
    let max: number | string | undefined;

    if (type === 'number' || type === 'currency') {
      const nums = nonNull
        .map((v) => (typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.-]+/g, ''))))
        .filter((v) => !isNaN(v));
      if (nums.length > 0) {
        min = Math.min(...nums);
        max = Math.max(...nums);
      }
    }

    const uniqueSet = new Set(nonNull);

    return {
      name: colName,
      type,
      sampleValues: Array.from(uniqueSet).slice(0, 5),
      nullCount: rows.length - nonNull.length,
      uniqueCount: uniqueSet.size,
      min,
      max,
    };
  });
}

/**
 * Calculate data quality metrics
 */
export function calculateQuality(rows: Record<string, any>[], columns: ColumnMetadata[]): DataQualitySummary {
  const rowCount = rows.length;
  const columnCount = columns.length;
  const totalCells = rowCount * columnCount;

  let missingCount = 0;
  for (const col of columns) {
    missingCount += col.nullCount;
  }

  const missingRate = totalCells > 0 ? Math.round((missingCount / totalCells) * 1000) / 10 : 0;

  // Duplicate detection using row stringification
  const seen = new Set<string>();
  let duplicateCount = 0;
  for (const row of rows) {
    const key = JSON.stringify(row);
    if (seen.has(key)) {
      duplicateCount++;
    } else {
      seen.add(key);
    }
  }

  return {
    rowCount,
    columnCount,
    missingCount,
    missingRate,
    duplicateCount,
  };
}

/**
 * Parse CSV File
 */
export function parseCSV(file: File): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        if (results.errors && results.errors.length > 0 && results.data.length === 0) {
          reject(new Error(results.errors[0].message));
        } else {
          resolve(results.data as Record<string, any>[]);
        }
      },
      error: (err) => reject(err),
    });
  });
}

/**
 * Parse Excel File (.xlsx, .xls)
 */
export async function parseExcel(file: File): Promise<{ sheetNames: string[]; getSheetData: (sheetName: string) => Record<string, any>[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;

  return {
    sheetNames,
    getSheetData: (sheetName: string) => {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) return [];
      return XLSX.utils.sheet_to_json(worksheet, { defval: null }) as Record<string, any>[];
    },
  };
}

/**
 * Parse JSON file
 */
export async function parseJSON(file: File): Promise<Record<string, any>[]> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === 'object') {
    // Look for first array property e.g. { data: [...] } or { items: [...] }
    for (const key of Object.keys(parsed)) {
      if (Array.isArray(parsed[key])) {
        return parsed[key];
      }
    }
  }
  throw new Error('JSON file must contain an array of objects.');
}

/**
 * Data Cleaning Operations
 */
export function cleanRemoveDuplicates(rows: Record<string, any>[]): Record<string, any>[] {
  const seen = new Set<string>();
  const cleaned: Record<string, any>[] = [];

  for (const row of rows) {
    const key = JSON.stringify(row);
    if (!seen.has(key)) {
      seen.add(key);
      cleaned.push(row);
    }
  }
  return cleaned;
}

export function cleanDropMissing(rows: Record<string, any>[]): Record<string, any>[] {
  return rows.filter((row) => {
    return Object.values(row).every((val) => val !== null && val !== undefined && val !== '');
  });
}

export function cleanFillMissing(rows: Record<string, any>[], columns: ColumnMetadata[]): Record<string, any>[] {
  // Precompute column averages for numeric columns
  const numericAverages: Record<string, number> = {};
  for (const col of columns) {
    if (col.type === 'number' || col.type === 'currency') {
      const validNums = rows
        .map((r) => r[col.name])
        .filter((v) => typeof v === 'number' && !isNaN(v));
      if (validNums.length > 0) {
        numericAverages[col.name] = Math.round((validNums.reduce((a, b) => a + b, 0) / validNums.length) * 100) / 100;
      } else {
        numericAverages[col.name] = 0;
      }
    }
  }

  return rows.map((row) => {
    const newRow = { ...row };
    for (const col of columns) {
      const val = newRow[col.name];
      if (val === null || val === undefined || val === '') {
        if (col.type === 'number' || col.type === 'currency') {
          newRow[col.name] = numericAverages[col.name] ?? 0;
        } else if (col.type === 'boolean') {
          newRow[col.name] = false;
        } else if (col.type === 'date') {
          newRow[col.name] = new Date().toISOString().split('T')[0];
        } else {
          newRow[col.name] = 'Unknown';
        }
      }
    }
    return newRow;
  });
}

export function cleanFixDataTypes(rows: Record<string, any>[], columns: ColumnMetadata[]): Record<string, any>[] {
  return rows.map((row) => {
    const newRow = { ...row };
    for (const col of columns) {
      let val = newRow[col.name];
      if (val === null || val === undefined) continue;

      if (col.type === 'number' || col.type === 'currency') {
        if (typeof val === 'string') {
          const cleanedStr = val.replace(/[^0-9.-]+/g, '');
          const parsed = parseFloat(cleanedStr);
          newRow[col.name] = isNaN(parsed) ? 0 : parsed;
        }
      } else if (col.type === 'boolean') {
        if (typeof val === 'string') {
          newRow[col.name] = val.toLowerCase() === 'true' || val === '1';
        }
      } else if (col.type === 'date') {
        if (typeof val === 'string' || typeof val === 'number') {
          const parsedDate = new Date(val);
          if (!isNaN(parsedDate.getTime())) {
            newRow[col.name] = parsedDate.toISOString().split('T')[0];
          }
        }
      }
    }
    return newRow;
  });
}

/**
 * Built-in Sample Datasets
 */
export const SAMPLE_DATASETS = [
  {
    id: 'ecommerce_sales',
    name: 'E-Commerce Sales & Profitability',
    fileName: 'ecommerce_sales_2025.csv',
    problem: 'Identify underperforming regional product segments, profit margins, and discounts that drag down overall profitability.',
    objectives: 'Maximize operating margins, detect unprofitable discount thresholds, and rank top regions and categories by net revenue.',
    generateData: () => {
      const categories = ['Technology', 'Office Supplies', 'Furniture'];
      const subCategories: Record<string, string[]> = {
        Technology: ['Phones', 'Laptops', 'Accessories', 'Copiers'],
        'Office Supplies': ['Paper', 'Binders', 'Storage', 'Appliances'],
        Furniture: ['Chairs', 'Tables', 'Bookcases', 'Furnishings'],
      };
      const regions = ['West', 'East', 'Central', 'South'];
      const segments = ['Consumer', 'Corporate', 'Home Office'];

      const rows: Record<string, any>[] = [];
      const startDate = new Date('2025-01-01');

      for (let i = 1; i <= 120; i++) {
        const cat = categories[Math.floor(Math.random() * categories.length)];
        const subCatList = subCategories[cat];
        const subCat = subCatList[Math.floor(Math.random() * subCatList.length)];
        const region = regions[Math.floor(Math.random() * regions.length)];
        const segment = segments[Math.floor(Math.random() * segments.length)];
        const quantity = Math.floor(Math.random() * 8) + 1;
        const unitPrice = cat === 'Technology' ? Math.floor(Math.random() * 450) + 150 : Math.floor(Math.random() * 120) + 20;
        const discountRate = [0, 0.05, 0.1, 0.15, 0.25, 0.35][Math.floor(Math.random() * 6)];
        const sales = Math.round(quantity * unitPrice * (1 - discountRate) * 100) / 100;
        // high discount often leads to negative profit
        const cost = quantity * unitPrice * 0.65;
        const profit = Math.round((sales - cost) * 100) / 100;

        const orderDate = new Date(startDate.getTime() + (i * 2.5) * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];

        rows.push({
          OrderID: `ORD-${2025000 + i}`,
          OrderDate: orderDate,
          Region: region,
          CustomerSegment: segment,
          Category: cat,
          SubCategory: subCat,
          Quantity: quantity,
          Sales: sales,
          Profit: profit,
          Discount: discountRate,
        });
      }
      return rows;
    },
  },
  {
    id: 'saas_mrr_churn',
    name: 'SaaS MRR & Customer Churn',
    fileName: 'saas_mrr_churn.csv',
    problem: 'Rising customer churn in mid-tier tiers and its relationship with ticket volume and NPS score.',
    objectives: 'Pinpoint primary drivers of customer churn, track net monthly recurring revenue (MRR) by tier, and establish retention interventions.',
    generateData: () => {
      const plans = ['Starter', 'Professional', 'Enterprise'];
      const rows: Record<string, any>[] = [];

      for (let i = 1; i <= 100; i++) {
        const plan = plans[Math.floor(Math.random() * plans.length)];
        const mrr = plan === 'Enterprise' ? Math.floor(Math.random() * 3000) + 2500 : plan === 'Professional' ? Math.floor(Math.random() * 600) + 300 : 99;
        const tickets = Math.floor(Math.random() * 12);
        const nps = tickets > 6 ? Math.floor(Math.random() * 4) + 2 : Math.floor(Math.random() * 5) + 6;
        const churnChance = tickets > 7 || nps < 5 ? 0.65 : 0.08;
        const isChurned = Math.random() < churnChance ? 1 : 0;
        const tenureMonths = Math.floor(Math.random() * 36) + 2;

        rows.push({
          CustomerID: `CUST-${1000 + i}`,
          Plan: plan,
          MRR: mrr,
          TenureMonths: tenureMonths,
          SupportTickets: tickets,
          NPS: nps,
          Churned: isChurned,
        });
      }
      return rows;
    },
  },
  {
    id: 'marketing_roi',
    name: 'Digital Marketing & Campaign ROI',
    fileName: 'marketing_campaigns_roi.csv',
    problem: 'Ad budget allocation is inefficient across paid channels with disparate customer acquisition costs.',
    objectives: 'Evaluate ROAS and conversion rates by channel, optimize channel spend distribution, and identify top performing creative themes.',
    generateData: () => {
      const channels = ['Google Search', 'Meta Ads', 'LinkedIn', 'YouTube', 'TikTok'];
      const rows: Record<string, any>[] = [];

      for (let i = 1; i <= 80; i++) {
        const channel = channels[Math.floor(Math.random() * channels.length)];
        const spend = Math.floor(Math.random() * 5000) + 800;
        const cpc = channel === 'LinkedIn' ? 6.5 : channel === 'Google Search' ? 3.2 : 1.4;
        const clicks = Math.round(spend / cpc);
        const impressions = clicks * (Math.floor(Math.random() * 25) + 20);
        const convRate = channel === 'Google Search' ? 0.045 : channel === 'LinkedIn' ? 0.038 : 0.022;
        const conversions = Math.round(clicks * convRate);
        const revenue = Math.round(conversions * (Math.floor(Math.random() * 250) + 120));
        const roas = spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0;

        rows.push({
          CampaignID: `CMP-${500 + i}`,
          Channel: channel,
          AdSpend: spend,
          Impressions: impressions,
          Clicks: clicks,
          Conversions: conversions,
          Revenue: revenue,
          ROAS: roas,
        });
      }
      return rows;
    },
  },
];
