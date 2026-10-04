import React, { useState, useEffect } from 'react';
import {
  Play,
  Download,
  Sparkles,
  Terminal,
  AlertCircle,
  Clock,
  Database,
  Copy,
  Check,
  RotateCcw,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Dataset, SavedQuery } from '../types';
import { executeQuery, QueryExecutionResult } from '../services/sqlEngine';
import { generateSqlFromText } from '../services/aiService';

interface SqlStudioViewProps {
  dataset: Dataset | null;
  savedQueries: SavedQuery[];
  setSavedQueries: React.Dispatch<React.SetStateAction<SavedQuery[]>>;
  businessProblem?: string;
  businessObjectives?: string;
}

export const SqlStudioView: React.FC<SqlStudioViewProps> = ({
  dataset,
  savedQueries,
  setSavedQueries,
  businessProblem,
  businessObjectives,
}) => {
  const [queryText, setQueryText] = useState<string>(
    'SELECT * FROM dataset LIMIT 10;'
  );
  const [naturalQuestion, setNaturalQuestion] = useState<string>('');
  const [isGeneratingSql, setIsGeneratingSql] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [currentResult, setCurrentResult] = useState<QueryExecutionResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeQueryExplanation, setActiveQueryExplanation] = useState<string>(
    'Displays the first 10 sample records from your active dataset.'
  );
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Initial load: if savedQueries exist, load the first one or run default query
  useEffect(() => {
    if (savedQueries.length > 0 && queryText === 'SELECT * FROM dataset LIMIT 10;') {
      handleSelectQuery(savedQueries[0]);
    } else if (dataset && !currentResult) {
      handleRunQuery('SELECT * FROM dataset LIMIT 10;');
    }
  }, [savedQueries, dataset]);

  const handleRunQuery = async (sqlToRun?: string) => {
    const sql = (sqlToRun || queryText).trim();
    if (!sql) return;

    setIsExecuting(true);
    setQueryError(null);

    try {
      const res = await executeQuery(sql);
      setCurrentResult(res);
      setCurrentPage(1);
    } catch (err: any) {
      setQueryError(err.message || 'SQLite query execution failed.');
      setCurrentResult(null);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleNaturalLanguageToSql = async () => {
    if (!naturalQuestion.trim() || !dataset) return;

    setIsGeneratingSql(true);
    setQueryError(null);

    try {
      const result = await generateSqlFromText({
        question: naturalQuestion,
        columns: dataset.columns,
        problem: businessProblem,
        objectives: businessObjectives,
        tableName: 'dataset',
      });

      if (result && result.sql) {
        setQueryText(result.sql);
        setActiveQueryExplanation(result.explanation || `Generated query for: "${naturalQuestion}"`);
        await handleRunQuery(result.sql);

        // Add to saved queries list
        const newSaved: SavedQuery = {
          id: `sq-${Date.now()}`,
          title: naturalQuestion,
          explanation: result.explanation || 'Custom generated query',
          sql: result.sql,
        };
        setSavedQueries((prev) => [newSaved, ...prev]);
        setNaturalQuestion('');
      }
    } catch (err: any) {
      setQueryError(err.message || 'Failed to generate SQL from text.');
    } finally {
      setIsGeneratingSql(false);
    }
  };

  const handleSelectQuery = (sq: SavedQuery) => {
    setQueryText(sq.sql);
    setActiveQueryExplanation(sq.explanation);
    handleRunQuery(sq.sql);
  };

  const handleCopyQuery = () => {
    navigator.clipboard.writeText(queryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCsv = () => {
    if (!currentResult || currentResult.columns.length === 0) return;

    const headers = currentResult.columns.join(',');
    const rows = currentResult.values.map((row) =>
      row
        .map((val) => {
          if (val === null || val === undefined) return '';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(',')
    );

    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `query_results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!dataset) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center bg-white rounded-2xl border border-purple-100 shadow-sm mt-8">
        <Terminal className="w-12 h-12 text-purple-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-black font-['Poppins']">No Database Loaded</h3>
        <p className="text-sm text-gray-500 mt-1">Please upload a dataset first to query via SQLite.</p>
      </div>
    );
  }

  // Filter current result rows if search active
  const filteredResultValues = currentResult
    ? currentResult.values.filter((row) => {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase();
        return row.some((cell) => String(cell).toLowerCase().includes(term));
      })
    : [];

  const totalPages = Math.ceil(filteredResultValues.length / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const visibleResultValues = filteredResultValues.slice(startIndex, startIndex + pageSize);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Natural Language to SQL Bar */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-[#FF6D00]" />
          <h3 className="text-base font-bold text-black font-['Poppins']">
            Ask in Plain English (AI SQL Generator)
          </h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Type your question in plain English. The AI understands your schema and writes optimized SQLite queries.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={naturalQuestion}
            onChange={(e) => setNaturalQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNaturalLanguageToSql();
            }}
            placeholder="e.g. Which product category has the lowest average profit margin, and how many orders does it represent?"
            className="flex-1 px-4 py-3 rounded-xl border border-purple-200 text-sm text-black focus:border-[#FF6D00] focus:ring-2 focus:ring-[#FF6D00]/20 outline-none transition"
          />
          <button
            onClick={handleNaturalLanguageToSql}
            disabled={isGeneratingSql || !naturalQuestion.trim()}
            className="px-6 py-3 rounded-xl bg-[#FF6D00] hover:bg-[#E65100] text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-md shadow-[#FF6D00]/20"
          >
            {isGeneratingSql ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>Generating SQL...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate SQL</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pre-generated / Saved Queries Sidebar */}
        <div className="lg:col-span-1 bg-white rounded-2xl p-5 shadow-sm border border-purple-100 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <span className="text-xs font-bold text-[#4A148C] uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[#FF6D00]" />
              Analytical Queries ({savedQueries.length})
            </span>
          </div>

          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            {savedQueries.map((sq) => {
              const isSelected = queryText.trim() === sq.sql.trim();
              return (
                <div
                  key={sq.id}
                  onClick={() => handleSelectQuery(sq)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer text-left ${
                    isSelected
                      ? 'border-[#FF6D00] bg-orange-50/40 shadow-sm'
                      : 'border-purple-100 hover:border-purple-300 hover:bg-purple-50/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-black line-clamp-1">{sq.title}</h4>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-[#FF6D00]"></span>}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                    {sq.explanation}
                  </p>
                </div>
              );
            })}

            {savedQueries.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">
                No saved queries yet. Generate an analysis or ask a question above.
              </p>
            )}
          </div>

          {/* Quick Schema Reference Chips */}
          <div className="pt-3 border-t border-gray-100">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-2">
              Available Columns (Double Quote):
            </span>
            <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto">
              {dataset.columns.map((c) => (
                <button
                  key={c.name}
                  onClick={() => {
                    setQueryText((prev) => `${prev} "${c.name}"`);
                  }}
                  className="px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-[#4A148C] text-[10px] font-mono border border-purple-200 cursor-pointer"
                  title="Click to insert into query"
                >
                  "{c.name}"
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SQL Editor & Results Area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Query Editor Box */}
          <div className="bg-white rounded-2xl shadow-sm border border-purple-100 overflow-hidden">
            {/* Editor Toolbar */}
            <div className="bg-[#4A148C] text-white px-4 py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#FF6D00]" />
                <span className="font-semibold font-mono">SQLite Editor (table: "dataset")</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyQuery}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#5c1c9c] hover:bg-[#6c23b5] text-purple-200 hover:text-white transition cursor-pointer"
                  title="Copy SQL"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={() => handleRunQuery()}
                  disabled={isExecuting}
                  className="flex items-center gap-1.5 px-4 py-1 rounded-lg bg-[#FF6D00] hover:bg-[#E65100] text-white font-bold transition cursor-pointer shadow-md shadow-[#FF6D00]/30"
                >
                  {isExecuting ? (
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>Run Query (Ctrl+Enter)</span>
                </button>
              </div>
            </div>

            {/* SQL Text Area */}
            <div className="p-3 bg-gray-900">
              <textarea
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleRunQuery();
                  }
                }}
                rows={7}
                spellCheck={false}
                className="w-full bg-transparent text-emerald-400 font-mono text-xs focus:outline-none resize-y leading-relaxed"
              />
            </div>

            {/* Plain English Explanation Banner */}
            {activeQueryExplanation && (
              <div className="px-4 py-2.5 bg-purple-50/70 border-t border-purple-100 flex items-start gap-2 text-xs">
                <Sparkles className="w-4 h-4 text-[#FF6D00] shrink-0 mt-0.5" />
                <p className="text-gray-700 font-medium leading-relaxed">
                  <strong className="text-[#4A148C]">Plain-English Explanation:</strong> {activeQueryExplanation}
                </p>
              </div>
            )}
          </div>

          {/* Query Error Display */}
          {queryError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">SQL Execution Error</p>
                <p className="font-mono mt-0.5">{queryError}</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  Tip: Ensure column names with spaces or symbols are enclosed in double quotes (e.g. "Customer Segment").
                </p>
              </div>
            </div>
          )}

          {/* Results Table Card */}
          {currentResult && (
            <div className="bg-white rounded-2xl shadow-sm border border-purple-100 overflow-hidden">
              {/* Results Header */}
              <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-black uppercase tracking-wider font-['Poppins']">
                    Query Results
                  </span>
                  <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-mono font-medium border border-emerald-200">
                    {currentResult.rowCount} rows
                  </span>
                  <span className="text-xs text-gray-500 flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 text-gray-400" />
                    {currentResult.executionTimeMs} ms
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Filter results..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1 rounded-lg border border-purple-200 text-xs text-black outline-none focus:border-[#FF6D00]"
                  />
                  <button
                    onClick={handleExportCsv}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-purple-200 hover:border-[#FF6D00] text-xs font-semibold text-black hover:text-[#FF6D00] transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* Table Body */}
              <div className="overflow-x-auto max-h-[380px]">
                {currentResult.columns.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-400">
                    Query executed successfully. 0 rows returned.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#4A148C] text-white sticky top-0 select-none">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center text-purple-200 border-r border-[#5c1c9c]">#</th>
                        {currentResult.columns.map((col) => (
                          <th key={col} className="py-2.5 px-4 font-semibold whitespace-nowrap border-r border-[#5c1c9c]">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {visibleResultValues.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-purple-50/40 transition">
                          <td className="py-2 px-3 text-center text-gray-400 font-mono bg-gray-50/40 border-r border-gray-100">
                            {startIndex + rIdx + 1}
                          </td>
                          {row.map((cell: any, cIdx: number) => (
                            <td key={cIdx} className="py-2 px-4 whitespace-nowrap text-gray-800 font-mono border-r border-gray-100 last:border-r-0">
                              {cell === null || cell === undefined ? (
                                <span className="text-gray-300 italic">null</span>
                              ) : typeof cell === 'number' ? (
                                <span className="text-black font-semibold">
                                  {cell.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                                </span>
                              ) : (
                                String(cell)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Results Pagination */}
              {filteredResultValues.length > pageSize && (
                <div className="p-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                  <div>
                    Showing {startIndex + 1} to {Math.min(startIndex + pageSize, filteredResultValues.length)} of {filteredResultValues.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-2 py-1 rounded border border-purple-200 disabled:opacity-40 cursor-pointer"
                    >
                      Prev
                    </button>
                    <span className="font-semibold text-black">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-2 py-1 rounded border border-purple-200 disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
