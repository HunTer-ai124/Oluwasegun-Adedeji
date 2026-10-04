import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DataUploadView } from './components/DataUploadView';
import { DataPreviewView } from './components/DataPreviewView';
import { SqlStudioView } from './components/SqlStudioView';
import { DashboardView } from './components/DashboardView';
import { AIChatPanel } from './components/AIChatPanel';
import { SupabaseModal } from './components/SupabaseModal';
import {
  Dataset,
  BusinessContext,
  KPIMetric,
  ChartConfig,
  SavedQuery,
  ChatMessage,
} from './types';
import { SAMPLE_DATASETS, analyzeColumns, calculateQuality } from './services/dataParser';
import {
  loadDataIntoSqlite,
  executeQuery,
  autoQuoteIdentifiers,
  computeFallbackKpi,
  computeFallbackChartData,
} from './services/sqlEngine';
import { generateDashboardSetup } from './services/aiService';

export default function App() {
  const [activeTab, setActiveTab] = useState<'upload' | 'preview' | 'sql' | 'dashboard'>('upload');
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [businessContext, setBusinessContext] = useState<BusinessContext>({
    problem: '',
    objectives: '',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGeneratedDashboard, setHasGeneratedDashboard] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Analytics State
  const [kpis, setKpis] = useState<KPIMetric[]>([]);
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [starterQuestions, setStarterQuestions] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);

  // Auto-load sample dataset on initial mount so app is immediately alive and useful
  useEffect(() => {
    const initDefaultSample = async () => {
      try {
        const sample = SAMPLE_DATASETS[0];
        const rows = sample.generateData();
        const columns = analyzeColumns(rows);
        const quality = calculateQuality(rows, columns);

        const newDataset: Dataset = {
          id: `ds-init`,
          name: sample.name,
          fileName: sample.fileName,
          rawRows: rows,
          cleanedRows: rows,
          columns,
          quality,
          cleanedHistory: [],
        };

        await loadDataIntoSqlite('dataset', columns, rows);

        setDataset(newDataset);
        setBusinessContext({
          problem: sample.problem,
          objectives: sample.objectives,
        });

        // Trigger automatic dashboard generation for instant rich preview
        triggerDashboardGeneration(newDataset, sample.problem, sample.objectives);
      } catch (err) {
        console.error('Initial sample load error:', err);
      }
    };

    initDefaultSample();
  }, []);

  const triggerDashboardGeneration = async (
    targetDataset?: Dataset,
    problemOverride?: string,
    objectivesOverride?: string
  ) => {
    const activeDataset = targetDataset || dataset;
    if (!activeDataset) return;

    setIsGenerating(true);
    setGlobalError(null);

    const problem = problemOverride ?? businessContext.problem;
    const objectives = objectivesOverride ?? businessContext.objectives;

    try {
      const generated = await generateDashboardSetup({
        problem: problem || 'Evaluate overall performance, profitability, and operational patterns',
        objectives: objectives || 'Identify top drivers, underperforming segments, and actionable growth opportunities',
        columns: activeDataset.columns,
        rowCount: activeDataset.cleanedRows.length,
        tableName: 'dataset',
      });

      // 1. Calculate KPI values live via SQLite
      const resolvedKpis: KPIMetric[] = await Promise.all(
        (generated.kpis || []).map(async (kpi: any, idx: number) => {
          try {
            const safeSql = autoQuoteIdentifiers(kpi.sql, activeDataset.columns);
            const res = await executeQuery(safeSql, activeDataset.columns);
            let val = res.values.length > 0 && res.values[0].length > 0 ? res.values[0][0] : null;
            if (
              val === null ||
              val === undefined ||
              val === 'N/A' ||
              val === 'NaN' ||
              (typeof val === 'number' && isNaN(val))
            ) {
              val = computeFallbackKpi(kpi, activeDataset);
            }
            return {
              id: `kpi-${idx}`,
              title: kpi.title,
              sql: safeSql,
              format: kpi.format || 'number',
              insight: kpi.insight,
              calculatedValue: val,
            };
          } catch (e: any) {
            console.warn(`Failed to execute KPI ${kpi.title}, using fallback:`, e);
            const fallbackVal = computeFallbackKpi(kpi, activeDataset);
            return {
              id: `kpi-${idx}`,
              title: kpi.title,
              sql: kpi.sql,
              format: kpi.format || 'number',
              insight: kpi.insight,
              calculatedValue: fallbackVal,
            };
          }
        })
      );

      // 2. Fetch data for each chart live via SQLite and guarantee chart type diversity
      const preferredTypes: ('donut' | 'bar' | 'area' | 'line' | 'scatter')[] = [
        'bar',
        'donut',
        'area',
        'line',
        'donut',
        'bar',
      ];
      let lineChartCount = 0;

      const rawCharts = generated.charts || [];
      const resolvedCharts: ChartConfig[] = await Promise.all(
        rawCharts.map(async (ch: any, idx: number) => {
          let chartType = ch.chartType ? (ch.chartType.toLowerCase().trim() as any) : preferredTypes[idx % preferredTypes.length];
          if (chartType === 'pie') chartType = 'donut';
          if (chartType === 'line') lineChartCount++;

          // Diversify if more than one line chart returned by AI
          if (lineChartCount > 1 && chartType === 'line') {
            chartType = preferredTypes[idx % preferredTypes.length];
          }

          if (!['donut', 'bar', 'area', 'line', 'pie', 'scatter'].includes(chartType)) {
            chartType = preferredTypes[idx % preferredTypes.length];
          }

          try {
            const safeSql = autoQuoteIdentifiers(ch.sql, activeDataset.columns);
            const res = await executeQuery(safeSql, activeDataset.columns);
            let data = res.rawObjects;
            if (!data || data.length === 0) {
              data = computeFallbackChartData({ ...ch, chartType }, activeDataset);
            }
            return {
              id: `chart-${idx}`,
              title: ch.title,
              chartType,
              sql: safeSql,
              xKey: ch.xKey,
              yKeys: ch.yKeys && ch.yKeys.length > 0 ? ch.yKeys : [Object.keys(data[0] || {})[1] || 'Value'],
              caption: ch.caption,
              data,
            };
          } catch (e: any) {
            console.warn(`Failed to execute Chart ${ch.title}, using fallback:`, e);
            const fallbackData = computeFallbackChartData({ ...ch, chartType }, activeDataset);
            return {
              id: `chart-${idx}`,
              title: ch.title,
              chartType,
              sql: ch.sql,
              xKey: ch.xKey,
              yKeys: ch.yKeys || [],
              caption: ch.caption,
              data: fallbackData,
            };
          }
        })
      );

      // 3. Set pre-built queries for SQL studio
      const preBuiltQueries: SavedQuery[] = (generated.sqlQueries || []).map((sq: any, idx: number) => ({
        id: `query-${idx}`,
        title: sq.title,
        explanation: sq.explanation,
        sql: autoQuoteIdentifiers(sq.sql, activeDataset.columns),
      }));

      setKpis(resolvedKpis);
      setCharts(resolvedCharts);
      setSavedQueries(preBuiltQueries);
      setStarterQuestions(generated.starterQuestions || []);
      setHasGeneratedDashboard(true);
      setActiveTab('dashboard');
    } catch (err: any) {
      console.warn('Network or AI generation error, building client fallback dashboard:', err);
      // Generate full client-side fallback dashboard with 5 KPIs and 5 diverse charts
      const numCols = activeDataset.columns.filter((c) => c.type === 'number' || c.type === 'currency');
      const textCols = activeDataset.columns.filter((c) => c.type === 'text');
      const dateCols = activeDataset.columns.filter((c) => c.type === 'date');
      const col1 = numCols[0] || activeDataset.columns[0] || { name: 'Value', type: 'number' };
      const col2 = numCols[1] || col1;
      const catCol = textCols[0] || activeDataset.columns[0] || { name: 'Category', type: 'text' };
      const catCol2 = textCols[1] || textCols[0] || catCol;
      const dateCol = dateCols[0];

      const fallbackKpis: KPIMetric[] = [
        {
          id: 'kpi-0',
          title: `Total ${col1.name}`,
          sql: `SELECT ROUND(COALESCE(SUM("${col1.name}"), 0), 2) AS value FROM "dataset"`,
          format: col1.type === 'currency' ? 'currency' : 'number',
          insight: `Cumulative aggregate across all recorded entries.`,
          calculatedValue: computeFallbackKpi({ title: 'Total' }, activeDataset),
        },
        {
          id: 'kpi-1',
          title: `Average ${col1.name}`,
          sql: `SELECT ROUND(COALESCE(AVG("${col1.name}"), 0), 2) AS value FROM "dataset"`,
          format: col1.type === 'currency' ? 'currency' : 'number',
          insight: `Baseline mean value across the entire dataset.`,
          calculatedValue: computeFallbackKpi({ title: 'Average' }, activeDataset),
        },
        {
          id: 'kpi-2',
          title: numCols.length > 1 ? `Total ${col2.name}` : `Peak ${col1.name}`,
          sql: numCols.length > 1
            ? `SELECT ROUND(COALESCE(SUM("${col2.name}"), 0), 2) AS value FROM "dataset"`
            : `SELECT ROUND(COALESCE(MAX("${col1.name}"), 0), 2) AS value FROM "dataset"`,
          format: (numCols.length > 1 ? col2.type : col1.type) === 'currency' ? 'currency' : 'number',
          insight: `Key operational volume and throughput indicator.`,
          calculatedValue: computeFallbackKpi({ title: numCols.length > 1 ? col2.name : 'Peak' }, activeDataset),
        },
        {
          id: 'kpi-3',
          title: 'Total Active Records',
          sql: `SELECT COUNT(*) AS value FROM "dataset"`,
          format: 'number',
          insight: `Total records loaded and queryable in SQLite.`,
          calculatedValue: activeDataset.cleanedRows.length,
        },
        {
          id: 'kpi-4',
          title: numCols.length > 1 ? `${col2.name} / ${col1.name} Ratio` : `Active Dimension Depth`,
          sql: numCols.length > 1
            ? `SELECT ROUND(COALESCE((SUM("${col2.name}") * 100.0) / NULLIF(SUM("${col1.name}"), 0), 0), 2) AS value FROM "dataset"`
            : `SELECT COUNT(DISTINCT "${catCol.name}") AS value FROM "dataset"`,
          format: numCols.length > 1 ? 'percent' : 'number',
          insight: `Evaluates operational distribution and segment density.`,
          calculatedValue: computeFallbackKpi({ title: 'Ratio' }, activeDataset),
        },
      ];

      const fallbackCharts: ChartConfig[] = [
        {
          id: 'chart-0',
          title: `${col1.name} by ${catCol.name}`,
          chartType: 'bar',
          sql: `SELECT "${catCol.name}", ROUND(COALESCE(SUM("${col1.name}"), 0), 2) AS "Total_${col1.name}" FROM "dataset" GROUP BY "${catCol.name}" ORDER BY "Total_${col1.name}" DESC LIMIT 10`,
          xKey: catCol.name,
          yKeys: [`Total_${col1.name}`],
          caption: `Bar chart identifies the top contributing ${catCol.name} segments by ${col1.name}.`,
          data: computeFallbackChartData({ chartType: 'bar', xKey: catCol.name, yKeys: [`Total_${col1.name}`] }, activeDataset),
        },
        {
          id: 'chart-1',
          title: `${catCol.name} Market Distribution`,
          chartType: 'donut',
          sql: `SELECT "${catCol.name}", ROUND(COALESCE(SUM("${col1.name}"), 0), 2) AS "Share_${col1.name}" FROM "dataset" GROUP BY "${catCol.name}" ORDER BY "Share_${col1.name}" DESC LIMIT 8`,
          xKey: catCol.name,
          yKeys: [`Share_${col1.name}`],
          caption: `Donut chart visualizes proportional concentration across ${catCol.name} categories.`,
          data: computeFallbackChartData({ chartType: 'donut', xKey: catCol.name, yKeys: [`Share_${col1.name}`] }, activeDataset),
        },
        {
          id: 'chart-2',
          title: dateCol ? `${col1.name} Cumulative Trend` : `${col1.name} Volume across ${catCol2.name}`,
          chartType: 'area',
          sql: dateCol
            ? `SELECT "${dateCol.name}", ROUND(COALESCE(SUM("${col1.name}"), 0), 2) AS "Volume_${col1.name}" FROM "dataset" GROUP BY "${dateCol.name}" ORDER BY "${dateCol.name}" ASC LIMIT 15`
            : `SELECT "${catCol2.name}", ROUND(COALESCE(SUM("${col1.name}"), 0), 2) AS "Volume_${col1.name}" FROM "dataset" GROUP BY "${catCol2.name}" LIMIT 10`,
          xKey: dateCol ? dateCol.name : catCol2.name,
          yKeys: [`Volume_${col1.name}`],
          caption: `Area chart highlights cumulative volume velocity and continuous trend patterns.`,
          data: computeFallbackChartData({ chartType: 'area', xKey: dateCol ? dateCol.name : catCol2.name, yKeys: [`Volume_${col1.name}`] }, activeDataset),
        },
        {
          id: 'chart-3',
          title: dateCol ? `${col1.name} Trajectory Velocity` : `Average ${col1.name} by ${catCol.name}`,
          chartType: 'line',
          sql: dateCol
            ? `SELECT "${dateCol.name}", ROUND(COALESCE(AVG("${col1.name}"), 0), 2) AS "Avg_${col1.name}" FROM "dataset" GROUP BY "${dateCol.name}" ORDER BY "${dateCol.name}" ASC LIMIT 15`
            : `SELECT "${catCol.name}", ROUND(COALESCE(AVG("${col1.name}"), 0), 2) AS "Avg_${col1.name}" FROM "dataset" GROUP BY "${catCol.name}" LIMIT 10`,
          xKey: dateCol ? dateCol.name : catCol.name,
          yKeys: [`Avg_${col1.name}`],
          caption: `Line chart monitors key milestone changes and benchmark trajectory across periods.`,
          data: computeFallbackChartData({ chartType: 'line', xKey: dateCol ? dateCol.name : catCol.name, yKeys: [`Avg_${col1.name}`] }, activeDataset),
        },
        {
          id: 'chart-4',
          title: `${catCol2.name} Portfolio Breakdown`,
          chartType: 'donut',
          sql: `SELECT "${catCol2.name}", ROUND(COALESCE(SUM("${col1.name}"), 0), 2) AS "Share_${col1.name}" FROM "dataset" GROUP BY "${catCol2.name}" LIMIT 6`,
          xKey: catCol2.name,
          yKeys: [`Share_${col1.name}`],
          caption: `Secondary donut chart showcases segment diversity and distribution balance.`,
          data: computeFallbackChartData({ chartType: 'donut', xKey: catCol2.name, yKeys: [`Share_${col1.name}`] }, activeDataset),
        },
      ];

      setKpis(fallbackKpis);
      setCharts(fallbackCharts);
      setHasGeneratedDashboard(true);
      setActiveTab('dashboard');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenSqlWithQuery = (sql: string) => {
    const existing = savedQueries.find((q) => q.sql.trim() === sql.trim());
    if (!existing) {
      setSavedQueries((prev) => [
        {
          id: `sq-${Date.now()}`,
          title: 'Custom Query from Dashboard',
          explanation: 'Inspected SQL query from dashboard card.',
          sql,
        },
        ...prev,
      ]);
    }
    setActiveTab('sql');
  };

  const handleResetDataset = () => {
    setDataset(null);
    setBusinessContext({ problem: '', objectives: '' });
    setKpis([]);
    setCharts([]);
    setSavedQueries([]);
    setStarterQuestions([]);
    setChatMessages([]);
    setHasGeneratedDashboard(false);
    setActiveTab('upload');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#EDE7F6] text-black font-['Inter']">
      {/* 1. Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        dataset={dataset}
        onNewUpload={() => setActiveTab('upload')}
        hasGeneratedDashboard={hasGeneratedDashboard}
        onResetDataset={handleResetDataset}
        onOpenSupabase={() => setIsSupabaseModalOpen(true)}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden">
        <Header
          activeTab={activeTab}
          dataset={dataset}
          isChatOpen={isChatOpen}
          setIsChatOpen={setIsChatOpen}
          onResetDataset={handleResetDataset}
          onOpenSupabase={() => setIsSupabaseModalOpen(true)}
          onExportDashboard={() => {
            // Trigger dashboard PDF report download
            const pdfBtn = document.querySelector('button[title="Download complete dashboard as PDF report"]') as HTMLButtonElement | null;
            if (pdfBtn) {
              pdfBtn.click();
            }
          }}
        />

        {/* Global Error Banner */}
        {globalError && (
          <div className="bg-red-600 text-white px-6 py-2.5 text-xs flex items-center justify-between shrink-0">
            <span>{globalError}</span>
            <button
              onClick={() => setGlobalError(null)}
              className="text-white hover:text-red-200 font-bold ml-4 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* View Switcher Container */}
        <main className="flex-1 overflow-y-auto bg-[#EDE7F6]">
          {activeTab === 'upload' && (
            <DataUploadView
              dataset={dataset}
              setDataset={setDataset}
              businessContext={businessContext}
              setBusinessContext={setBusinessContext}
              onGenerateDashboard={() => triggerDashboardGeneration()}
              isGenerating={isGenerating}
              onNavigateToPreview={() => setActiveTab('preview')}
              onResetDataset={handleResetDataset}
              onOpenSupabase={() => setIsSupabaseModalOpen(true)}
            />
          )}

          {activeTab === 'preview' && (
            <DataPreviewView
              dataset={dataset}
              setDataset={setDataset}
              onNavigateToSql={() => setActiveTab('sql')}
              onNavigateToDashboard={() => setActiveTab('dashboard')}
            />
          )}

          {activeTab === 'sql' && (
            <SqlStudioView
              dataset={dataset}
              savedQueries={savedQueries}
              setSavedQueries={setSavedQueries}
              businessProblem={businessContext.problem}
              businessObjectives={businessContext.objectives}
            />
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              dataset={dataset}
              businessContext={businessContext}
              kpis={kpis}
              setKpis={setKpis}
              charts={charts}
              setCharts={setCharts}
              onOpenSqlWithQuery={handleOpenSqlWithQuery}
              onRefreshDashboard={() => triggerDashboardGeneration()}
              isGenerating={isGenerating}
              onOpenSupabase={() => setIsSupabaseModalOpen(true)}
            />
          )}
        </main>
      </div>

      {/* 3. Right AI Data Agent Chat Panel */}
      <AIChatPanel
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        dataset={dataset}
        businessContext={businessContext}
        starterQuestions={starterQuestions}
        messages={chatMessages}
        setMessages={setChatMessages}
      />

      {/* 4. Supabase Cloud Connection & Sync Modal */}
      <SupabaseModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        dataset={dataset}
        businessContext={businessContext}
        kpis={kpis}
        charts={charts}
      />
    </div>
  );
}
