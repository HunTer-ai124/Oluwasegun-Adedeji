import React, { useState, useEffect, useRef } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ScatterChart,
  Scatter,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Hash,
  Sparkles,
  Download,
  Trash2,
  PlusCircle,
  Filter,
  FileImage,
  FileText,
  Code2,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Layers,
  Database,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Dataset, KPIMetric, ChartConfig, BusinessContext } from '../types';
import { executeQuery, computeFallbackKpi, computeFallbackChartData } from '../services/sqlEngine';
import { createCustomChart } from '../services/aiService';
import {
  exportDashboardToPdf,
  exportChartToPdf,
  downloadImage,
  captureElementImage,
} from '../services/pdfExport';

interface DashboardViewProps {
  dataset: Dataset | null;
  businessContext: BusinessContext;
  kpis: KPIMetric[];
  setKpis: React.Dispatch<React.SetStateAction<KPIMetric[]>>;
  charts: ChartConfig[];
  setCharts: React.Dispatch<React.SetStateAction<ChartConfig[]>>;
  onOpenSqlWithQuery: (sql: string) => void;
  onRefreshDashboard: () => void;
  isGenerating: boolean;
  onOpenSupabase?: () => void;
}

const CHART_COLORS = [
  '#4A148C', // Deep Imperial Purple (Primary Brand)
  '#FF6D00', // Vibrant Accent Orange
  '#7E57C2', // Royal Medium Purple
  '#FF9100', // Bright Sunrise Orange
  '#9C27B0', // Vivid Amethyst Purple
  '#E65100', // Deep Warm Burnt Orange
  '#311B92', // Midnight Indigo Purple
  '#FFA726', // Warm Golden Amber
  '#6A1B9A', // Imperial Purple
  '#BA68C8', // Soft Lilac Purple
  '#AB47BC', // Medium Orchid Purple
  '#212121', // Dark Charcoal Slate
];

/**
 * Prepares and sanitizes chart data to guarantee 100% visibility in Recharts
 */
function prepareChartData(
  chart: ChartConfig,
  rawData: Record<string, any>[] | undefined,
  dataset: Dataset | null
): { data: Record<string, any>[]; xKey: string; yKeys: string[] } {
  let data = rawData && rawData.length > 0 ? rawData : (chart.data && chart.data.length > 0 ? chart.data : []);

  if (data.length === 0 && dataset) {
    data = computeFallbackChartData(chart, dataset);
  }

  if (!data || data.length === 0) {
    return { data: [], xKey: chart.xKey || 'Category', yKeys: chart.yKeys || ['Value'] };
  }

  const availableKeys = Object.keys(data[0] || {});

  // 1. Resolve actual X Key
  let resolvedXKey = chart.xKey;
  if (!availableKeys.includes(resolvedXKey)) {
    const match = availableKeys.find(
      (k) => k.toLowerCase() === (chart.xKey || '').toLowerCase()
    );
    resolvedXKey = match || availableKeys[0] || 'Category';
  }

  // 2. Resolve actual Y Keys
  let resolvedYKeys = (chart.yKeys || []).filter((k) => availableKeys.includes(k));
  if (resolvedYKeys.length === 0) {
    const candidates = availableKeys.filter((k) => k !== resolvedXKey);
    resolvedYKeys = candidates.length > 0 ? [candidates[0]] : [availableKeys[0]];
  }

  // 3. Sanitize data rows to ensure numeric values for Recharts coordinates
  const sanitized = data.map((item, rowIdx) => {
    const row: Record<string, any> = { ...item };

    if (row[resolvedXKey] === undefined || row[resolvedXKey] === null || row[resolvedXKey] === '') {
      row[resolvedXKey] = `Group ${rowIdx + 1}`;
    } else {
      row[resolvedXKey] = String(row[resolvedXKey]);
    }

    resolvedYKeys.forEach((yKey) => {
      const rawVal = row[yKey];
      if (typeof rawVal === 'number' && !isNaN(rawVal)) {
        row[yKey] = Math.round(rawVal * 100) / 100;
      } else {
        const parsed = parseFloat(String(rawVal ?? '').replace(/[^0-9.-]+/g, ''));
        row[yKey] = isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
      }
    });

    return row;
  });

  return {
    data: sanitized,
    xKey: resolvedXKey,
    yKeys: resolvedYKeys,
  };
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  dataset,
  businessContext,
  kpis,
  setKpis,
  charts,
  setCharts,
  onOpenSqlWithQuery,
  onRefreshDashboard,
  isGenerating,
  onOpenSupabase,
}) => {
  const [selectedCategoryColumn, setSelectedCategoryColumn] = useState<string>('');
  const [selectedCategoryValue, setSelectedCategoryValue] = useState<string>('ALL');
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [activeSqlModal, setActiveSqlModal] = useState<{ title: string; sql: string } | null>(null);

  // Add Chart with AI state
  const [isAddingChart, setIsAddingChart] = useState(false);
  const [newChartPrompt, setNewChartPrompt] = useState('');
  const [isCreatingChart, setIsCreatingChart] = useState(false);
  const [addChartError, setAddChartError] = useState<string | null>(null);

  // Export state
  const [isExporting, setIsExporting] = useState<'png' | 'pdf' | null>(null);
  const [exportingChartId, setExportingChartId] = useState<string | null>(null);
  const [exportNotification, setExportNotification] = useState<{
    type: 'info' | 'success' | 'error';
    message: string;
    downloadUrl?: string;
    downloadFilename?: string;
  } | null>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Keep references to latest KPIs and Charts to prevent stale closures
  const chartsRef = useRef(charts);
  chartsRef.current = charts;
  const kpisRef = useRef(kpis);
  kpisRef.current = kpis;

  // Auto-generate if dataset exists but charts are empty
  useEffect(() => {
    if (dataset && charts.length === 0 && !isGenerating) {
      onRefreshDashboard();
    }
  }, [dataset, charts.length, isGenerating, onRefreshDashboard]);

  // Detect low-cardinality categorical column for global filtering
  useEffect(() => {
    if (!dataset || dataset.columns.length === 0) return;

    const catCol = dataset.columns.find(
      (c) => c.type === 'text' && c.uniqueCount >= 2 && c.uniqueCount <= 15
    );

    if (catCol) {
      setSelectedCategoryColumn(catCol.name);
      // Fetch distinct values for dropdown
      const distinctVals = Array.from(
        new Set(
          dataset.cleanedRows
            .map((r) => r[catCol.name])
            .filter((v) => v !== null && v !== undefined && v !== '')
        )
      ).map(String);
      setCategoryOptions(distinctVals);
      setSelectedCategoryValue('ALL');
    }
  }, [dataset]);

  // Recalculate KPIs and Charts when filter changes or on load
  useEffect(() => {
    if (!dataset) return;
    refreshDataWithFilter();
  }, [selectedCategoryValue, selectedCategoryColumn, dataset]);

  const buildFilteredSql = (rawSql: string): string => {
    if (selectedCategoryValue === 'ALL' || !selectedCategoryColumn) {
      return rawSql;
    }

    const safeCol = `"${selectedCategoryColumn}"`;
    const escapedVal = selectedCategoryValue.replace(/'/g, "''");
    const filterClause = `${safeCol} = '${escapedVal}'`;

    // Inject filter into SQLite query
    const upper = rawSql.toUpperCase();
    if (upper.includes(' WHERE ')) {
      return rawSql.replace(/ WHERE /i, ` WHERE ${filterClause} AND `);
    } else if (upper.includes(' GROUP BY ')) {
      return rawSql.replace(/ GROUP BY /i, ` WHERE ${filterClause} GROUP BY `);
    } else if (upper.includes(' ORDER BY ')) {
      return rawSql.replace(/ ORDER BY /i, ` WHERE ${filterClause} ORDER BY `);
    } else if (upper.includes(' LIMIT ')) {
      return rawSql.replace(/ LIMIT /i, ` WHERE ${filterClause} LIMIT `);
    } else {
      return `${rawSql.trim().replace(/;$/, '')} WHERE ${filterClause};`;
    }
  };

  const refreshDataWithFilter = async () => {
    const currentKpis = kpisRef.current;
    const currentCharts = chartsRef.current;
    if (!dataset || currentKpis.length === 0) return;

    // 1. Recalculate KPIs
    const updatedKpis = await Promise.all(
      currentKpis.map(async (kpi) => {
        try {
          const sql = buildFilteredSql(kpi.sql);
          const res = await executeQuery(sql, dataset.columns);
          let val = res.values.length > 0 && res.values[0].length > 0 ? res.values[0][0] : null;
          if (val === null || val === undefined || val === 'N/A') {
            val = computeFallbackKpi(kpi, dataset);
          }
          return { ...kpi, calculatedValue: val, error: undefined };
        } catch (err: any) {
          console.warn(`Error running KPI "${kpi.title}":`, err);
          const fallbackVal = computeFallbackKpi(kpi, dataset);
          return { ...kpi, calculatedValue: fallbackVal, error: undefined };
        }
      })
    );
    setKpis(updatedKpis);

    // 2. Recalculate Charts if present
    if (currentCharts.length > 0) {
      const updatedCharts = await Promise.all(
        currentCharts.map(async (chart) => {
          try {
            const sql = buildFilteredSql(chart.sql);
            const res = await executeQuery(sql, dataset.columns);
            let data = res.rawObjects;
            if (!data || data.length === 0) {
              data = computeFallbackChartData(chart, dataset);
            }
            return { ...chart, data, error: undefined };
          } catch (err: any) {
            console.warn(`Error running chart "${chart.title}":`, err);
            const fallbackData = computeFallbackChartData(chart, dataset);
            return { ...chart, data: fallbackData, error: undefined };
          }
        })
      );
      setCharts(updatedCharts);
    }
  };

  const handleRemoveChart = (chartId: string) => {
    setCharts((prev) => prev.filter((c) => c.id !== chartId));
  };

  const handleCreateNewChart = async () => {
    if (!newChartPrompt.trim() || !dataset) return;
    setIsCreatingChart(true);
    setAddChartError(null);

    try {
      const generated = await createCustomChart({
        chartPrompt: newChartPrompt,
        columns: dataset.columns,
        problem: businessContext.problem,
        objectives: businessContext.objectives,
        tableName: 'dataset',
      });

      const res = await executeQuery(generated.sql);
      const newChart: ChartConfig = {
        id: `chart-${Date.now()}`,
        title: generated.title,
        chartType: (generated.chartType as any) || 'bar',
        sql: generated.sql,
        xKey: generated.xKey,
        yKeys: generated.yKeys,
        caption: generated.caption,
        data: res.rawObjects,
      };

      setCharts((prev) => [newChart, ...prev]);
      setNewChartPrompt('');
      setIsAddingChart(false);
    } catch (err: any) {
      setAddChartError(err.message || 'Failed to create chart.');
    } finally {
      setIsCreatingChart(false);
    }
  };

  // Export full dashboard as PNG
  const handleExportPNG = async () => {
    if (!dashboardRef.current) return;
    setIsExporting('png');
    setExportNotification({ type: 'info', message: 'Generating high-resolution PNG...' });
    try {
      const dataUrl = await captureElementImage(dashboardRef.current);
      if (dataUrl) {
        downloadImage(dataUrl, `InsightLab_Dashboard_${Date.now()}.png`);
        setExportNotification({ type: 'success', message: 'Dashboard PNG downloaded successfully!' });
      } else {
        throw new Error('Unable to capture dashboard canvas.');
      }
    } catch (err: any) {
      console.error('PNG export failed', err);
      setExportNotification({ type: 'error', message: `PNG download failed: ${err.message || 'Please try again.'}` });
    } finally {
      setIsExporting(null);
      setTimeout(() => setExportNotification(null), 3500);
    }
  };

  // Export full dashboard as PDF
  const handleExportPDF = async () => {
    setIsExporting('pdf');
    setExportNotification({ type: 'info', message: 'Compiling high-resolution executive PDF report...' });
    try {
      const res = await exportDashboardToPdf({
        datasetName: dataset?.name,
        rowCount: dataset?.cleanedRows.length,
        businessProblem: businessContext.problem,
        businessObjectives: businessContext.objectives,
        kpis,
        charts,
        dashboardElement: dashboardRef.current || undefined,
      });
      setExportNotification({
        type: 'success',
        message: 'Executive PDF report downloaded!',
        downloadUrl: res.blobUrl,
        downloadFilename: res.filename,
      });
    } catch (err: any) {
      console.error('PDF export failed', err);
      setExportNotification({ type: 'error', message: `PDF download failed: ${err.message || 'Please try again.'}` });
    } finally {
      setIsExporting(null);
      setTimeout(() => setExportNotification(null), 8000);
    }
  };

  // Export individual chart as PDF report
  const handleExportChartPDF = async (chart: ChartConfig) => {
    const elem = document.getElementById(`chart-card-${chart.id}`);
    setExportingChartId(chart.id);
    setExportNotification({ type: 'info', message: `Exporting PDF report for "${chart.title}"...` });
    try {
      const res = await exportChartToPdf(elem, chart, dataset?.name);
      setExportNotification({
        type: 'success',
        message: `Chart PDF downloaded: "${chart.title}"`,
        downloadUrl: res.blobUrl,
        downloadFilename: res.filename,
      });
    } catch (err: any) {
      console.error('Chart PDF export failed', err);
      setExportNotification({ type: 'error', message: `Chart PDF failed: ${err.message || 'Please try again.'}` });
    } finally {
      setExportingChartId(null);
      setTimeout(() => setExportNotification(null), 8000);
    }
  };

  // Export individual chart as PNG image
  const handleExportChartPNG = async (chart: ChartConfig) => {
    const elem = document.getElementById(`chart-card-${chart.id}`);
    if (!elem) return;
    setExportingChartId(chart.id);
    setExportNotification({ type: 'info', message: `Generating PNG for "${chart.title}"...` });
    try {
      const dataUrl = await captureElementImage(elem);
      if (dataUrl) {
        const safeTitle = (chart.title || 'Chart').replace(/[^a-zA-Z0-9_-]/g, '_');
        downloadImage(dataUrl, `InsightLab_Chart_${safeTitle}.png`);
        setExportNotification({ type: 'success', message: `Chart PNG downloaded: "${chart.title}"` });
      } else {
        throw new Error('Unable to capture chart graphic.');
      }
    } catch (err: any) {
      console.error('Chart PNG export failed', err);
      setExportNotification({ type: 'error', message: 'Chart PNG export failed.' });
    } finally {
      setExportingChartId(null);
      setTimeout(() => setExportNotification(null), 3500);
    }
  };

  const formatKpiValue = (val: any, format: string, kpi?: KPIMetric) => {
    let resolvedVal = val;
    if (
      resolvedVal === null ||
      resolvedVal === undefined ||
      resolvedVal === 'N/A' ||
      resolvedVal === 'NaN' ||
      resolvedVal === 'null' ||
      resolvedVal === 'undefined' ||
      resolvedVal === '' ||
      (typeof resolvedVal === 'number' && isNaN(resolvedVal))
    ) {
      if (kpi && dataset) {
        resolvedVal = computeFallbackKpi(kpi, dataset);
      } else if (dataset) {
        resolvedVal = dataset.cleanedRows.length;
      } else {
        resolvedVal = 0;
      }
    }

    if (typeof resolvedVal === 'string') {
      const cleaned = resolvedVal.replace(/[$,%]/g, '').trim();
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed) && !cleaned.includes(' ') && !isNaN(Number(cleaned))) {
        resolvedVal = parsed;
      }
    }

    const num = Number(resolvedVal);
    if (isNaN(num)) {
      if (typeof resolvedVal === 'string' && resolvedVal.length > 0 && resolvedVal !== 'N/A') {
        return resolvedVal;
      }
      return (dataset?.cleanedRows.length || 0).toLocaleString();
    }

    if (format === 'currency') {
      return `$${num.toLocaleString(undefined, {
        minimumFractionDigits: num % 1 !== 0 ? 2 : 0,
        maximumFractionDigits: 2,
      })}`;
    }
    if (format === 'percent') {
      const p = num > 1 ? num : num * 100;
      return `${p.toFixed(1)}%`;
    }
    return num.toLocaleString();
  };

  if (!dataset) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center bg-white rounded-2xl border border-purple-100 shadow-sm mt-8">
        <Sparkles className="w-12 h-12 text-purple-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-black font-['Poppins']">No Dataset Loaded</h3>
        <p className="text-sm text-gray-500 mt-1">Upload a dataset to generate your instant executive dashboard.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* SQL Modal for inspecting chart queries */}
      {activeSqlModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-black font-['Poppins'] flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[#FF6D00]" />
                <span>{activeSqlModal.title}</span>
              </h3>
              <button
                onClick={() => setActiveSqlModal(null)}
                className="text-gray-400 hover:text-black font-bold"
              >
                ✕
              </button>
            </div>
            <div className="bg-gray-900 p-4 rounded-xl">
              <pre className="text-emerald-400 font-mono text-xs whitespace-pre-wrap">
                {activeSqlModal.sql}
              </pre>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  onOpenSqlWithQuery(activeSqlModal.sql);
                  setActiveSqlModal(null);
                }}
                className="px-4 py-2 rounded-xl bg-[#4A148C] text-white text-xs font-semibold hover:bg-[#380e6d] transition cursor-pointer"
              >
                Open in SQL Studio
              </button>
              <button
                onClick={() => setActiveSqlModal(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Control & Filter Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-purple-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Global Filter */}
        <div className="flex flex-wrap items-center gap-3">
          {categoryOptions.length > 0 && selectedCategoryColumn && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#FF6D00]" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Filter by {selectedCategoryColumn}:
              </span>
              <select
                value={selectedCategoryValue}
                onChange={(e) => setSelectedCategoryValue(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-purple-200 text-xs font-medium text-black focus:border-[#FF6D00] outline-none bg-white cursor-pointer"
              >
                <option value="ALL">All {selectedCategoryColumn}s</option>
                {categoryOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedCategoryValue !== 'ALL' && (
            <button
              onClick={() => setSelectedCategoryValue('ALL')}
              className="text-xs text-[#FF6D00] hover:underline font-semibold cursor-pointer"
            >
              Reset Filter
            </button>
          )}
        </div>

        {/* Action Buttons: Add Chart & Exports */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsAddingChart(!isAddingChart)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-[#4A148C] border border-purple-200 text-xs font-semibold transition cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 text-[#FF6D00]" />
            <span>Add Chart with AI</span>
          </button>

          <button
            onClick={handleExportPNG}
            disabled={isExporting !== null}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-purple-200 hover:border-[#FF6D00] text-xs font-semibold text-black hover:text-[#FF6D00] transition cursor-pointer disabled:opacity-50"
            title="Download PNG image"
          >
            <FileImage className="w-3.5 h-3.5 text-[#FF6D00]" />
            <span>{isExporting === 'png' ? 'Exporting...' : 'PNG'}</span>
          </button>

          <button
            onClick={handleExportPDF}
            disabled={isExporting !== null}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#4A148C] hover:bg-[#380e6d] text-white text-xs font-semibold shadow-sm transition cursor-pointer disabled:opacity-50"
            title="Download complete dashboard as PDF report"
          >
            <FileText className="w-3.5 h-3.5 text-[#FF6D00]" />
            <span>{isExporting === 'pdf' ? 'Generating PDF...' : 'Download Dashboard PDF'}</span>
          </button>

          {onOpenSupabase && (
            <button
              onClick={onOpenSupabase}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-semibold transition cursor-pointer"
              title="Store dataset & dashboard into HunTer-ai124's Supabase project"
            >
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>Store in Supabase</span>
            </button>
          )}

          <button
            onClick={onRefreshDashboard}
            disabled={isGenerating}
            className="p-2 rounded-xl border border-purple-200 hover:border-[#4A148C] text-gray-600 hover:text-[#4A148C] transition cursor-pointer"
            title="Re-synthesize Dashboard"
          >
            <RotateCcw className={`w-4 h-4 ${isGenerating ? 'animate-spin text-[#FF6D00]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Add Custom Chart AI Box */}
      {isAddingChart && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-purple-200 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-black font-['Poppins'] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#FF6D00]" />
              <span>Describe the chart you want to add</span>
            </h4>
            <button
              onClick={() => setIsAddingChart(false)}
              className="text-xs text-gray-400 hover:text-black font-semibold cursor-pointer"
            >
              Cancel
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newChartPrompt}
              onChange={(e) => setNewChartPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateNewChart();
              }}
              placeholder="e.g. Show top 5 sub-categories by sales volume as a horizontal bar chart"
              className="flex-1 px-4 py-2.5 rounded-xl border border-purple-200 text-xs text-black focus:border-[#FF6D00] outline-none"
            />
            <button
              onClick={handleCreateNewChart}
              disabled={isCreatingChart || !newChartPrompt.trim()}
              className="px-5 py-2.5 rounded-xl bg-[#FF6D00] hover:bg-[#E65100] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isCreatingChart ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>Building...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Chart</span>
                </>
              )}
            </button>
          </div>
          {addChartError && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {addChartError}
            </p>
          )}
        </div>
      )}

      {/* Capture Container for PNG / PDF Export */}
      <div ref={dashboardRef} className="space-y-6 p-2 rounded-2xl">
        {/* Business Problem & Objectives Reminder Card */}
        {(businessContext.problem || businessContext.objectives) && (
          <div className="bg-[#4A148C] text-white rounded-2xl p-6 shadow-md">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold tracking-wider text-purple-200 uppercase flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#FF6D00]" />
                Guided Analytical Scope
              </span>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#5c1c9c] text-purple-200 font-mono">
                {dataset.cleanedRows.length.toLocaleString()} rows analyzed
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {businessContext.problem && (
                <div className="bg-[#380e6d] p-3.5 rounded-xl border border-[#5c1c9c]">
                  <span className="font-bold text-[#FF6D00] block mb-1 uppercase text-[10px] tracking-wider">
                    Business Problem:
                  </span>
                  <p className="text-purple-100 leading-relaxed font-medium">
                    {businessContext.problem}
                  </p>
                </div>
              )}
              {businessContext.objectives && (
                <div className="bg-[#380e6d] p-3.5 rounded-xl border border-[#5c1c9c]">
                  <span className="font-bold text-purple-200 block mb-1 uppercase text-[10px] tracking-wider">
                    Core Objectives:
                  </span>
                  <p className="text-purple-100 leading-relaxed font-medium">
                    {businessContext.objectives}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Generation Progress Indicator */}
        {isGenerating && (
          <div className="bg-purple-100/90 border border-purple-300 text-[#4A148C] px-5 py-3 rounded-2xl flex items-center justify-between animate-pulse shadow-sm">
            <div className="flex items-center gap-2.5 text-xs font-semibold">
              <RotateCcw className="w-4 h-4 animate-spin text-[#FF6D00]" />
              <span>InsightLab AI is synthesizing SQL queries and constructing diverse visual dashboards (Donut, Bar, Area, Line)...</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-[#4A148C] shadow-2xs font-semibold">
              In-Browser SQLite Live
            </span>
          </div>
        )}

        {/* 1. KPI Cards (4 to 6 metrics) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-black font-['Poppins'] uppercase tracking-wider">
              Executive Key Performance Indicators
            </h3>
            <span className="text-xs text-gray-500 font-mono">{kpis.length} metrics live</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {kpis.map((kpi, index) => (
              <div
                key={index}
                className="bg-white rounded-2xl p-5 shadow-sm border border-purple-100 flex flex-col justify-between hover:shadow-md transition group"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-600 line-clamp-1" title={kpi.title}>
                      {kpi.title}
                    </span>
                    <button
                      onClick={() => setActiveSqlModal({ title: kpi.title, sql: kpi.sql })}
                      className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-[#4A148C] cursor-pointer"
                      title="View SQL query"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-2xl font-bold text-black font-mono tracking-tight my-1">
                    {formatKpiValue(kpi.calculatedValue, kpi.format, kpi)}
                  </p>
                </div>

                <p className="text-[11px] text-gray-500 mt-2 line-clamp-2 leading-relaxed border-t border-gray-50 pt-2 font-medium">
                  {kpi.insight}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Charts Grid (4 to 6 charts) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-black font-['Poppins'] uppercase tracking-wider">
              Data Insights & Distributions
            </h3>
            <span className="text-xs text-gray-500 font-mono">{charts.length} charts</span>
          </div>

          {charts.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 border border-purple-200 text-center space-y-4 shadow-sm my-4">
              <Sparkles className="w-12 h-12 text-[#FF6D00] mx-auto animate-pulse" />
              <h4 className="text-base font-bold text-black font-['Poppins']">
                Dashboard Visualizations Ready to Generate
              </h4>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Synthesize tailored Donut, Bar, Area, and Line charts powered by in-browser SQLite and your business objectives.
              </p>
              <button
                onClick={onRefreshDashboard}
                disabled={isGenerating}
                className="px-6 py-3 rounded-xl bg-[#FF6D00] hover:bg-[#E65100] text-white text-xs font-bold transition inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-[#FF6D00]/25 disabled:opacity-50"
              >
                <RotateCcw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>{isGenerating ? 'Synthesizing Charts...' : 'Generate Visual Charts Now'}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {charts.map((chart, idx) => {
                const prepared = prepareChartData(chart, chart.data, dataset);
                const data = prepared.data;
                const resolvedXKey = prepared.xKey;
                const resolvedYKeys = prepared.yKeys;
                const chartColor = CHART_COLORS[idx % CHART_COLORS.length];

                return (
                  <div
                    key={chart.id}
                    id={`chart-card-${chart.id}`}
                    className="bg-white rounded-2xl p-5 shadow-sm border border-purple-100 flex flex-col justify-between hover:shadow-md transition"
                  >
                    {/* Chart Header */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-black font-['Poppins']">
                            {chart.title}
                          </h4>
                        </div>
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-mono">
                          {chart.chartType} chart • x: {resolvedXKey}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Interactive Chart Type Switcher */}
                        <select
                          value={chart.chartType}
                          onChange={(e) => {
                            const newType = e.target.value as any;
                            setCharts((prev) =>
                              prev.map((c) => (c.id === chart.id ? { ...c, chartType: newType } : c))
                            );
                          }}
                          className="px-2 py-1 rounded-lg border border-purple-200 text-[11px] font-semibold text-[#4A148C] bg-purple-50/80 hover:bg-purple-100 outline-none cursor-pointer tracking-wide transition shadow-2xs"
                          title="Change visualization type"
                        >
                          <option value="donut">🍩 Donut</option>
                          <option value="bar">📊 Bar</option>
                          <option value="area">📈 Area</option>
                          <option value="line">📉 Line</option>
                          <option value="pie">🥧 Pie</option>
                          <option value="scatter">⚪ Scatter</option>
                        </select>

                        {/* Download Chart as PDF */}
                        <button
                          onClick={() => handleExportChartPDF(chart)}
                          disabled={exportingChartId === chart.id}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-[#4A148C] text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                          title="Download Chart as PDF Report"
                        >
                          {exportingChartId === chart.id ? (
                            <RotateCcw className="w-3 h-3 animate-spin text-[#FF6D00]" />
                          ) : (
                            <FileText className="w-3 h-3 text-[#FF6D00]" />
                          )}
                          <span>Chart PDF</span>
                        </button>

                        {/* Download Chart as PNG */}
                        <button
                          onClick={() => handleExportChartPNG(chart)}
                          disabled={exportingChartId === chart.id}
                          className="p-1 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-[#4A148C] transition cursor-pointer"
                          title="Download Chart as PNG"
                        >
                          <FileImage className="w-3.5 h-3.5" />
                        </button>

                        {/* Inspect SQL */}
                        <button
                          onClick={() => setActiveSqlModal({ title: chart.title, sql: chart.sql })}
                          className="p-1 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-[#4A148C] transition cursor-pointer"
                          title="Inspect underlying SQL"
                        >
                          <Code2 className="w-4 h-4" />
                        </button>

                        {/* Remove Chart */}
                        <button
                          onClick={() => handleRemoveChart(chart.id)}
                          className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition cursor-pointer"
                          title="Remove chart"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Chart Rendering Area */}
                    <div className="w-full my-2 relative" style={{ height: 280, minHeight: 280, width: '100%' }}>
                      {chart.error ? (
                        <div className="h-full flex items-center justify-center p-4 bg-red-50 rounded-xl text-red-600 text-xs">
                          {chart.error}
                        </div>
                      ) : data.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-gray-400">
                          No data available for this query filter.
                        </div>
                      ) : chart.chartType === 'donut' ? (
                        /* Dedicated Donut Chart */
                        <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                          <PieChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                            <Pie
                              data={data}
                              dataKey={resolvedYKeys[0] || 'value'}
                              nameKey={resolvedXKey}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={95}
                              paddingAngle={3}
                              stroke="#ffffff"
                              strokeWidth={2}
                            >
                              {data.map((_, pIdx) => (
                                <Cell
                                  key={`cell-${pIdx}`}
                                  fill={CHART_COLORS[pIdx % CHART_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#4A148C',
                                borderRadius: '12px',
                                color: '#fff',
                                fontSize: '11px',
                                border: 'none',
                                boxShadow: '0 4px 12px rgba(74, 20, 140, 0.25)',
                              }}
                              formatter={(val: any) => [
                                typeof val === 'number' ? val.toLocaleString() : val,
                                resolvedYKeys[0] || 'Share',
                              ]}
                            />
                            <Legend
                              wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }}
                              layout="horizontal"
                              verticalAlign="bottom"
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : chart.chartType === 'area' ? (
                        /* Dedicated Area Chart with Translucent Purple / Orange Gradient */
                        <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                          <AreaChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
                            <defs>
                              <linearGradient id={`gradient-purple-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#7E57C2" stopOpacity={0.75} />
                                <stop offset="95%" stopColor="#4A148C" stopOpacity={0.05} />
                              </linearGradient>
                              <linearGradient id={`gradient-orange-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#FF6D00" stopOpacity={0.75} />
                                <stop offset="95%" stopColor="#FF6D00" stopOpacity={0.05} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3E8FF" />
                            <XAxis
                              dataKey={resolvedXKey}
                              tick={{ fontSize: 10, fill: '#4A148C', fontWeight: 500 }}
                              interval={0}
                              angle={-20}
                              textAnchor="end"
                            />
                            <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#4A148C',
                                borderRadius: '12px',
                                color: '#fff',
                                fontSize: '11px',
                                border: 'none',
                                boxShadow: '0 4px 12px rgba(74, 20, 140, 0.25)',
                              }}
                            />
                            {resolvedYKeys.map((yKey, yIdx) => {
                              const isPurple = yIdx % 2 === 0;
                              return (
                                <Area
                                  key={yKey}
                                  type="monotone"
                                  dataKey={yKey}
                                  stroke={isPurple ? '#4A148C' : '#FF6D00'}
                                  strokeWidth={2.5}
                                  fillOpacity={1}
                                  fill={isPurple ? `url(#gradient-purple-${chart.id})` : `url(#gradient-orange-${chart.id})`}
                                />
                              );
                            })}
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : chart.chartType === 'bar' ? (
                        /* Bar Chart with Rounded Tops */
                        <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                          <BarChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3E8FF" />
                            <XAxis
                              dataKey={resolvedXKey}
                              tick={{ fontSize: 10, fill: '#4A148C', fontWeight: 500 }}
                              interval={0}
                              angle={-20}
                              textAnchor="end"
                            />
                            <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#4A148C',
                                borderRadius: '12px',
                                color: '#fff',
                                fontSize: '11px',
                                border: 'none',
                                boxShadow: '0 4px 12px rgba(74, 20, 140, 0.25)',
                              }}
                            />
                            {resolvedYKeys.map((yKey, yIdx) => (
                              <Bar
                                key={yKey}
                                dataKey={yKey}
                                fill={CHART_COLORS[(idx + yIdx) % CHART_COLORS.length]}
                                radius={[6, 6, 0, 0]}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      ) : chart.chartType === 'line' ? (
                        /* Line Chart with Contrasting Purple & Orange */
                        <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                          <LineChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3E8FF" />
                            <XAxis
                              dataKey={resolvedXKey}
                              tick={{ fontSize: 10, fill: '#4A148C', fontWeight: 500 }}
                              interval={0}
                              angle={-20}
                              textAnchor="end"
                            />
                            <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#4A148C',
                                borderRadius: '12px',
                                color: '#fff',
                                fontSize: '11px',
                                border: 'none',
                                boxShadow: '0 4px 12px rgba(74, 20, 140, 0.25)',
                              }}
                            />
                            {resolvedYKeys.map((yKey, yIdx) => (
                              <Line
                                key={yKey}
                                type="monotone"
                                dataKey={yKey}
                                stroke={CHART_COLORS[(idx + yIdx) % CHART_COLORS.length]}
                                strokeWidth={3}
                                dot={{ r: 4, fill: '#FF6D00', stroke: '#4A148C', strokeWidth: 1.5 }}
                                activeDot={{ r: 6, fill: '#FF6D00' }}
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      ) : chart.chartType === 'pie' ? (
                        /* Circular Pie Chart */
                        <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                          <PieChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                            <Pie
                              data={data}
                              dataKey={resolvedYKeys[0] || 'value'}
                              nameKey={resolvedXKey}
                              cx="50%"
                              cy="50%"
                              outerRadius={95}
                              paddingAngle={2}
                              stroke="#ffffff"
                              strokeWidth={2}
                            >
                              {data.map((_, pIdx) => (
                                <Cell
                                  key={`cell-${pIdx}`}
                                  fill={CHART_COLORS[pIdx % CHART_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#4A148C',
                                borderRadius: '12px',
                                color: '#fff',
                                fontSize: '11px',
                                border: 'none',
                                boxShadow: '0 4px 12px rgba(74, 20, 140, 0.25)',
                              }}
                            />
                            <Legend
                              wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }}
                              layout="horizontal"
                              verticalAlign="bottom"
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        /* Scatter Chart */
                        <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                          <ScatterChart margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3E8FF" />
                            <XAxis dataKey={resolvedXKey} tick={{ fontSize: 10, fill: '#6B7280' }} />
                            <YAxis dataKey={resolvedYKeys[0]} tick={{ fontSize: 10, fill: '#6B7280' }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#4A148C',
                                borderRadius: '12px',
                                color: '#fff',
                                fontSize: '11px',
                                border: 'none',
                                boxShadow: '0 4px 12px rgba(74, 20, 140, 0.25)',
                              }}
                            />
                            <Scatter name={chart.title} data={data} fill="#7E57C2" />
                          </ScatterChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* AI One-Line Insight Caption */}
                    <div className="pt-3 border-t border-purple-50 flex items-start gap-2 text-xs">
                      <Sparkles className="w-3.5 h-3.5 text-[#FF6D00] shrink-0 mt-0.5" />
                      <p className="text-gray-700 font-medium leading-relaxed">
                        {chart.caption}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Floating Export Toast Notification */}
      {exportNotification && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl border flex items-center gap-3 text-xs font-semibold transition-all animate-fadeIn ${
            exportNotification.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : exportNotification.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-[#4A148C] text-white border-[#380e6d]'
          }`}
        >
          {exportNotification.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          ) : exportNotification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <RotateCcw className="w-4 h-4 animate-spin text-[#FF6D00] shrink-0" />
          )}
          <span>{exportNotification.message}</span>
          {exportNotification.downloadUrl && (
            <a
              href={exportNotification.downloadUrl}
              download={exportNotification.downloadFilename || 'report.pdf'}
              className="ml-2 px-3 py-1.5 rounded-xl bg-[#FF6D00] hover:bg-[#E65100] text-white text-[11px] font-bold inline-flex items-center gap-1.5 shadow-md transition cursor-pointer no-underline"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save File</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
};
