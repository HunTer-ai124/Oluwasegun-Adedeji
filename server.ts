import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Initialize Google Gen AI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const app = express();
app.use(express.json({ limit: '10mb' }));

function quoteCol(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function buildAnalyticalFallback(schema: any[], problem: string, objectives: string, rowCount: number, tableName = 'dataset') {
  const cols = schema || [];
  const numericCols = cols.filter((c: any) => c.type === 'number' || c.type === 'currency');
  const textCols = cols.filter((c: any) => c.type === 'text');
  const dateCols = cols.filter((c: any) => c.type === 'date');

  const col1 = numericCols[0] || cols[0] || { name: 'Value', type: 'number' };
  const col2 = numericCols[1] || numericCols[0] || cols[1] || col1;
  const catCol = textCols[0] || cols[0] || { name: 'Category', type: 'text' };
  const catCol2 = textCols[1] || textCols[0] || catCol;
  const dateCol = dateCols[0];

  const kpis = [
    {
      title: `Total ${col1.name}`,
      sql: `SELECT ROUND(COALESCE(SUM(${quoteCol(col1.name)}), 0), 2) AS value FROM "${tableName}"`,
      format: col1.type === 'currency' ? 'currency' : 'number',
      insight: `Aggregates total cumulative ${col1.name} across all active records in the dataset.`,
    },
    {
      title: `Average ${col1.name}`,
      sql: `SELECT ROUND(COALESCE(AVG(${quoteCol(col1.name)}), 0), 2) AS value FROM "${tableName}"`,
      format: col1.type === 'currency' ? 'currency' : 'number',
      insight: `Calculates average ${col1.name} per record to establish standard baseline performance.`,
    },
    {
      title: numericCols.length > 1 ? `Total ${col2.name}` : `Peak ${col1.name}`,
      sql: numericCols.length > 1
        ? `SELECT ROUND(COALESCE(SUM(${quoteCol(col2.name)}), 0), 2) AS value FROM "${tableName}"`
        : `SELECT ROUND(COALESCE(MAX(${quoteCol(col1.name)}), 0), 2) AS value FROM "${tableName}"`,
      format: (numericCols.length > 1 ? col2.type : col1.type) === 'currency' ? 'currency' : 'number',
      insight: `Tracks secondary operational metric to monitor volume and throughput.`,
    },
    {
      title: 'Total Active Records',
      sql: `SELECT COUNT(*) AS value FROM "${tableName}"`,
      format: 'number',
      insight: `Total number of data points currently ingested and queryable via SQLite.`,
    },
    {
      title: numericCols.length > 1 ? `${col2.name} / ${col1.name} Ratio` : `Baseline ${col1.name}`,
      sql: numericCols.length > 1
        ? `SELECT ROUND(COALESCE((SUM(${quoteCol(col2.name)}) * 100.0) / NULLIF(SUM(${quoteCol(col1.name)}), 0), 0), 2) AS value FROM "${tableName}"`
        : `SELECT ROUND(COALESCE(MIN(${quoteCol(col1.name)}), 0), 2) AS value FROM "${tableName}"`,
      format: numericCols.length > 1 ? 'percent' : 'number',
      insight: `Assesses operational efficiency and margin distribution relative to gross volume.`,
    },
  ];

  const charts = [
    {
      id: 'chart-cat-sum',
      title: `${col1.name} by ${catCol.name}`,
      chartType: 'bar',
      sql: `SELECT ${quoteCol(catCol.name)}, ROUND(COALESCE(SUM(${quoteCol(col1.name)}), 0), 2) AS "Total_${col1.name}" FROM "${tableName}" GROUP BY ${quoteCol(catCol.name)} ORDER BY "Total_${col1.name}" DESC LIMIT 10`,
      xKey: catCol.name,
      yKeys: [`Total_${col1.name}`],
      caption: `Bar chart identifies which ${catCol.name} segments generate the highest aggregate ${col1.name}.`,
    },
    {
      id: 'chart-cat-share',
      title: `${catCol.name} Market Distribution`,
      chartType: 'donut',
      sql: `SELECT ${quoteCol(catCol.name)}, ROUND(COALESCE(SUM(${quoteCol(col1.name)}), 0), 2) AS "Share_${col1.name}" FROM "${tableName}" GROUP BY ${quoteCol(catCol.name)} ORDER BY "Share_${col1.name}" DESC LIMIT 8`,
      xKey: catCol.name,
      yKeys: [`Share_${col1.name}`],
      caption: `Donut chart visualizes the proportional share and concentration of each ${catCol.name} category.`,
    },
    {
      id: 'chart-trend-area',
      title: dateCol ? `${col1.name} Cumulative Volume over ${dateCol.name}` : `${col1.name} Distribution across ${catCol2.name}`,
      chartType: 'area',
      sql: dateCol
        ? `SELECT ${quoteCol(dateCol.name)}, ROUND(COALESCE(SUM(${quoteCol(col1.name)}), 0), 2) AS "Volume_${col1.name}" FROM "${tableName}" GROUP BY ${quoteCol(dateCol.name)} ORDER BY ${quoteCol(dateCol.name)} ASC LIMIT 15`
        : `SELECT ${quoteCol(catCol2.name)}, ROUND(COALESCE(SUM(${quoteCol(col1.name)}), 0), 2) AS "Volume_${col1.name}" FROM "${tableName}" GROUP BY ${quoteCol(catCol2.name)} ORDER BY "Volume_${col1.name}" DESC LIMIT 10`,
      xKey: dateCol ? dateCol.name : catCol2.name,
      yKeys: [`Volume_${col1.name}`],
      caption: `Area chart highlights cumulative volume velocity and continuous trend patterns.`,
    },
    {
      id: 'chart-trend-line',
      title: dateCol ? `${col1.name} Trajectory over ${dateCol.name}` : `Average ${col1.name} by ${catCol.name}`,
      chartType: 'line',
      sql: dateCol
        ? `SELECT ${quoteCol(dateCol.name)}, ROUND(COALESCE(AVG(${quoteCol(col1.name)}), 0), 2) AS "Avg_${col1.name}" FROM "${tableName}" GROUP BY ${quoteCol(dateCol.name)} ORDER BY ${quoteCol(dateCol.name)} ASC LIMIT 15`
        : `SELECT ${quoteCol(catCol.name)}, ROUND(COALESCE(AVG(${quoteCol(col1.name)}), 0), 2) AS "Avg_${col1.name}" FROM "${tableName}" GROUP BY ${quoteCol(catCol.name)} ORDER BY "Avg_${col1.name}" DESC LIMIT 10`,
      xKey: dateCol ? dateCol.name : catCol.name,
      yKeys: [`Avg_${col1.name}`],
      caption: `Line chart monitors key milestone changes and benchmark trajectory across periods.`,
    },
    {
      id: 'chart-comparison',
      title: numericCols.length > 1 ? `${col1.name} vs ${col2.name}` : `Top Contributing ${catCol2.name} Share`,
      chartType: numericCols.length > 1 ? 'bar' : 'donut',
      sql: numericCols.length > 1
        ? `SELECT ${quoteCol(catCol.name)}, ROUND(COALESCE(SUM(${quoteCol(col1.name)}), 0), 2) AS "${col1.name}", ROUND(COALESCE(SUM(${quoteCol(col2.name)}), 0), 2) AS "${col2.name}" FROM "${tableName}" GROUP BY ${quoteCol(catCol.name)} LIMIT 10`
        : `SELECT ${quoteCol(catCol2.name)}, ROUND(COALESCE(SUM(${quoteCol(col1.name)}), 0), 2) AS "Share_${col1.name}" FROM "${tableName}" GROUP BY ${quoteCol(catCol2.name)} LIMIT 6`,
      xKey: numericCols.length > 1 ? catCol.name : catCol2.name,
      yKeys: numericCols.length > 1 ? [col1.name, col2.name] : [`Share_${col1.name}`],
      caption: `Multi-dimensional comparative analysis identifying primary business opportunities.`,
    },
  ];

  const sqlQueries = [
    {
      title: `${catCol.name} Performance Overview`,
      explanation: `Aggregates ${col1.name} and record counts grouped by ${catCol.name} to identify top performing segments.`,
      sql: `SELECT ${quoteCol(catCol.name)}, COUNT(*) AS "Record_Count", ROUND(SUM(${quoteCol(col1.name)}), 2) AS "Total_${col1.name}", ROUND(AVG(${quoteCol(col1.name)}), 2) AS "Avg_${col1.name}" FROM "${tableName}" GROUP BY ${quoteCol(catCol.name)} ORDER BY "Total_${col1.name}" DESC;`,
    },
    {
      title: `Above-Average ${col1.name} Records`,
      explanation: `Filters records where ${col1.name} exceeds the overall dataset mean to inspect high-impact items.`,
      sql: `SELECT * FROM "${tableName}" WHERE ${quoteCol(col1.name)} > (SELECT AVG(${quoteCol(col1.name)}) FROM "${tableName}") LIMIT 20;`,
    },
    {
      title: `Top 10 Ranked by ${col1.name}`,
      explanation: `Ranks the top 10 records by ${col1.name} to highlight maximum value contributors.`,
      sql: `SELECT * FROM "${tableName}" ORDER BY ${quoteCol(col1.name)} DESC LIMIT 10;`,
    },
  ];

  const starterQuestions = [
    `Which ${catCol.name} generates the highest ${col1.name}?`,
    `What is the average ${col1.name} across all records?`,
    `Are there any significant outliers or patterns in ${catCol.name}?`,
  ];

  return { kpis, charts, sqlQueries, starterQuestions };
}

/**
 * Endpoint 1: Generate initial dashboard, KPIs, charts, and starter queries
 * based on dataset schema, business problem, and objectives.
 */
app.post('/api/ai/generate-dashboard', async (req: Request, res: Response) => {
  const { problem, objectives, schema, rowCount, tableName = 'dataset' } = req.body;
  try {
    const schemaDescription = (schema || [])
      .map((col: any) => `- ${col.name} (${col.type}): sample values: [${(col.sampleValues || []).slice(0, 4).join(', ')}]`)
      .join('\n');

    const prompt = `You are a Senior Data Analyst and SQL Expert at InsightLab.
A user has uploaded a dataset with ${rowCount || 'multiple'} rows in SQLite table "${tableName}".

TABLE SCHEMA:
${schemaDescription}

BUSINESS PROBLEM:
${problem || 'General performance and trends analysis'}

OBJECTIVES:
${objectives || 'Identify key insights, metrics, and actionable recommendations'}

TASK:
Generate a comprehensive, tailored analytical setup for SQLite:
1. 4 to 6 KPI metrics (e.g. Total Revenue, Avg Order Value, Conversion Rate, Churn Rate).
   For each KPI:
   - "title": Short label
   - "sql": A valid SQLite query that returns a single numeric row or aggregate named "value" (e.g., SELECT ROUND(COALESCE(SUM("sales"), 0), 2) AS value FROM "dataset")
   - "format": "currency" | "number" | "percent"
   - "insight": Brief 1-sentence context or interpretation
2. 4 to 6 Insightful Charts with MANDATORY DIVERSE CHART TYPES:
   DO NOT USE ONLY LINE CHARTS! You MUST vary the chart types across the dashboard:
   - Must include at least one Donut chart ("donut")
   - Must include at least one Bar chart ("bar")
   - Must include at least one Area chart ("area")
   - Must include at least one Line chart ("line")
   - Additional charts can be "donut", "bar", or "scatter"
   Allowed chartType values: "donut" | "bar" | "area" | "line" | "pie" | "scatter"
   For each chart:
   - "title": Chart title
   - "chartType": "donut" | "bar" | "area" | "line" | "pie" | "scatter"
   - "sql": A valid SQLite SELECT query aggregating data (LIMIT to 10-15 rows so chart is readable). Columns MUST match xKey and yKeys.
   - "xKey": Name of the column for X axis / Category
   - "yKeys": Array of column names for Y values
   - "caption": A punchy one-line insight caption written in plain English
3. 3 to 4 Pre-built SQL queries for the SQL Studio:
   - "title": Query name
   - "explanation": Plain-English explanation of what this query does and why it matters
   - "sql": Valid SQLite query with comments
4. 3 Starter questions for the AI Agent:
   - Array of strings, e.g. ["What factors most strongly correlate with performance?", ...]

IMPORTANT SQL RULES:
- Use table name "${tableName}".
- ALWAYS enclose ALL column names in double quotes like "Column Name".
- SQLite syntax only (use standard functions: COALESCE, SUM, COUNT, AVG, MIN, MAX, ROUND, STRFTIME, CASE WHEN, etc.).
- Ensure all queries are valid SQLite.
`;

    let responseText = '';
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              kpis: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    sql: { type: Type.STRING },
                    format: { type: Type.STRING },
                    insight: { type: Type.STRING },
                  },
                  required: ['title', 'sql', 'format', 'insight'],
                },
              },
              charts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    chartType: { type: Type.STRING },
                    sql: { type: Type.STRING },
                    xKey: { type: Type.STRING },
                    yKeys: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    caption: { type: Type.STRING },
                  },
                  required: ['title', 'chartType', 'sql', 'xKey', 'yKeys', 'caption'],
                },
              },
              sqlQueries: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                    sql: { type: Type.STRING },
                  },
                  required: ['title', 'explanation', 'sql'],
                },
              },
              starterQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['kpis', 'charts', 'sqlQueries', 'starterQuestions'],
          },
        },
      });
      responseText = response.text || '';
    } catch (apiErr: any) {
      console.warn('Primary Gemini call error, using analytical fallback generator:', apiErr.message);
      const fallback = buildAnalyticalFallback(schema, problem, objectives, rowCount, tableName);
      return res.json({ success: true, data: fallback });
    }

    const parsed = JSON.parse(responseText || '{}');
    if (!parsed.kpis || parsed.kpis.length === 0) {
      const fallback = buildAnalyticalFallback(schema, problem, objectives, rowCount, tableName);
      return res.json({ success: true, data: fallback });
    }

    // Forcefully guarantee diverse chart types in the dashboard
    const preferredTypes = ['bar', 'donut', 'area', 'line', 'donut', 'bar'];
    let lineCount = 0;
    parsed.charts = (parsed.charts || []).map((ch: any, idx: number) => {
      let type = ch.chartType ? ch.chartType.toLowerCase().trim() : preferredTypes[idx % preferredTypes.length];
      if (type === 'pie') type = 'donut';
      if (type === 'line') lineCount++;

      // If more than one line chart, diversify to avoid monotone charts
      if (lineCount > 1 && type === 'line') {
        type = preferredTypes[idx % preferredTypes.length];
      }

      if (!['donut', 'bar', 'area', 'line', 'pie', 'scatter'].includes(type)) {
        type = preferredTypes[idx % preferredTypes.length];
      }

      return {
        ...ch,
        chartType: type,
      };
    });

    res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.warn('Dashboard generation fallback invoked:', error.message);
    const fallback = buildAnalyticalFallback(schema, problem, objectives, rowCount, tableName);
    res.json({ success: true, data: fallback });
  }
});

/**
 * Endpoint 2: Generate SQL from natural language question
 */
app.post('/api/ai/text-to-sql', async (req: Request, res: Response) => {
  try {
    const { question, schema, problem, objectives, tableName = 'dataset' } = req.body;

    const schemaDescription = (schema || [])
      .map((col: any) => `- "${col.name}" (${col.type}): sample values: [${(col.sampleValues || []).slice(0, 3).join(', ')}]`)
      .join('\n');

    const prompt = `You are an expert SQL engineer.
Write a clean, efficient SQLite query to answer the user's natural language question.

TABLE: "${tableName}"
SCHEMA:
${schemaDescription}

BUSINESS CONTEXT:
Problem: ${problem || 'N/A'}
Objectives: ${objectives || 'N/A'}

USER QUESTION:
"${question}"

Generate:
1. sql: Valid SQLite query. Wrap table and column names with double quotes if needed.
2. explanation: Clear 1-2 sentence plain-English explanation of how the query works and what it computes.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sql: { type: Type.STRING },
            explanation: { type: Type.STRING },
          },
          required: ['sql', 'explanation'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Error in text-to-sql:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate SQL query.',
    });
  }
});

/**
 * Endpoint 3: AI Data Agent Step 1: Decide SQL for user question in chat
 */
app.post('/api/ai/chat-generate-sql', async (req: Request, res: Response) => {
  try {
    const { message, history, schema, problem, objectives, tableName = 'dataset' } = req.body;

    const schemaDescription = (schema || [])
      .map((col: any) => `- "${col.name}" (${col.type}): sample values: [${(col.sampleValues || []).slice(0, 3).join(', ')}]`)
      .join('\n');

    const prompt = `You are InsightLab's AI Data Agent.
A user asked: "${message}"

TABLE: "${tableName}"
SCHEMA:
${schemaDescription}

BUSINESS CONTEXT:
Problem: ${problem || 'N/A'}
Objectives: ${objectives || 'N/A'}

CHAT HISTORY:
${(history || [])
  .slice(-4)
  .map((m: any) => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`)
  .join('\n')}

Generate the optimal SQLite query to retrieve the data required to answer the question.
If the question can be answered without SQL (e.g. greeting or clarification), set needsSql: false.
Also suggest if the result is best shown as:
- 'text' (simple number or short statement)
- 'table' (multi-column rows)
- 'chart' (trend or distribution with bar/line/pie)
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            needsSql: { type: Type.BOOLEAN },
            sql: { type: Type.STRING },
            displayType: { type: Type.STRING },
            chartType: { type: Type.STRING },
            xKey: { type: Type.STRING },
            yKeys: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            explanation: { type: Type.STRING },
          },
          required: ['needsSql', 'displayType', 'explanation'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Error generating chat SQL:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to determine query.',
    });
  }
});

/**
 * Endpoint 4: AI Data Agent Step 2: Synthesize answer from SQL results
 * (Strictly query results / aggregate summary, NEVER raw dataset)
 */
app.post('/api/ai/chat-synthesize', async (req: Request, res: Response) => {
  try {
    const { message, sql, queryResults, problem, objectives } = req.body;

    const resultsSlice = Array.isArray(queryResults) ? queryResults.slice(0, 25) : queryResults;

    const prompt = `You are InsightLab's Data Agent.
Synthesize a concise, executive-level plain English answer to the user's question based on the executed SQL query and its results.

USER QUESTION:
"${message}"

SQL EXECUTED:
${sql || 'None'}

QUERY RESULTS (first 25 rows):
${JSON.stringify(resultsSlice, null, 2)}

BUSINESS CONTEXT:
Problem: ${problem || 'N/A'}
Objectives: ${objectives || 'N/A'}

Provide:
1. answer: A clear, conversational explanation in plain English highlighting key findings, numbers, and actionable takeaways.
2. keyTakeaway: A single punchy sentence summarizing the main insight.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: { type: Type.STRING },
            keyTakeaway: { type: Type.STRING },
          },
          required: ['answer', 'keyTakeaway'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Error synthesizing chat answer:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to synthesize answer.',
    });
  }
});

/**
 * Endpoint 5: Add a new custom chart via prompt
 */
app.post('/api/ai/create-chart', async (req: Request, res: Response) => {
  try {
    const { chartPrompt, schema, problem, objectives, tableName = 'dataset' } = req.body;

    const schemaDescription = (schema || [])
      .map((col: any) => `- "${col.name}" (${col.type}): sample values: [${(col.sampleValues || []).slice(0, 3).join(', ')}]`)
      .join('\n');

    const prompt = `You are a data visualization architect.
User requested a new chart: "${chartPrompt}"

TABLE: "${tableName}"
SCHEMA:
${schemaDescription}

BUSINESS CONTEXT:
Problem: ${problem || 'N/A'}
Objectives: ${objectives || 'N/A'}

Create a valid SQLite query and visualization specification:
- title: clear chart title
- chartType: "bar" | "line" | "pie" | "scatter"
- sql: SQLite query aggregated to max 15 rows
- xKey: Category / X-axis field
- yKeys: Array of metric fields
- caption: 1-line insightful takeaway
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            chartType: { type: Type.STRING },
            sql: { type: Type.STRING },
            xKey: { type: Type.STRING },
            yKeys: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            caption: { type: Type.STRING },
          },
          required: ['title', 'chartType', 'sql', 'xKey', 'yKeys', 'caption'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Error creating custom chart:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create chart.',
    });
  }
});

// Setup Vite middleware or static serving
async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`InsightLab Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
