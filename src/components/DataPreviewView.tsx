import React, { useState } from 'react';
import {
  TableProperties,
  Hash,
  Type,
  Calendar,
  DollarSign,
  ToggleLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  X,
  Check,
} from 'lucide-react';
import { Dataset, ColumnType } from '../types';
import { loadDataIntoSqlite } from '../services/sqlEngine';
import { analyzeColumns, calculateQuality } from '../services/dataParser';

interface DataPreviewViewProps {
  dataset: Dataset | null;
  setDataset?: React.Dispatch<React.SetStateAction<Dataset | null>>;
  onNavigateToSql: () => void;
  onNavigateToDashboard: () => void;
}

export const DataPreviewView: React.FC<DataPreviewViewProps> = ({
  dataset,
  setDataset,
  onNavigateToSql,
  onNavigateToDashboard,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'schema'>('preview');
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, any>>({});

  const handleOpenAddRow = () => {
    if (!dataset) return;
    const initial: Record<string, any> = {};
    dataset.columns.forEach((col) => {
      initial[col.name] = col.type === 'number' || col.type === 'currency' ? 0 : '';
    });
    setNewRowValues(initial);
    setIsAddingRow(true);
  };

  const handleSaveNewRow = async () => {
    if (!dataset || !setDataset) return;
    const updatedRows = [...dataset.cleanedRows, newRowValues];
    const columns = analyzeColumns(updatedRows);
    const quality = calculateQuality(updatedRows, columns);

    await loadDataIntoSqlite('dataset', columns, updatedRows);

    setDataset({
      ...dataset,
      cleanedRows: updatedRows,
      columns,
      quality,
      cleanedHistory: [...dataset.cleanedHistory, `Manually added 1 new row`],
    });

    setIsAddingRow(false);
  };

  if (!dataset) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center bg-white rounded-2xl border border-purple-100 shadow-sm mt-8">
        <TableProperties className="w-12 h-12 text-purple-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-black font-['Poppins']">No Dataset Loaded</h3>
        <p className="text-sm text-gray-500 mt-1">Please upload a dataset or choose a sample to inspect.</p>
      </div>
    );
  }

  const renderTypeIcon = (type: ColumnType) => {
    switch (type) {
      case 'number':
        return <Hash className="w-3.5 h-3.5 text-blue-600" />;
      case 'currency':
        return <DollarSign className="w-3.5 h-3.5 text-emerald-600" />;
      case 'date':
        return <Calendar className="w-3.5 h-3.5 text-purple-600" />;
      case 'boolean':
        return <ToggleLeft className="w-3.5 h-3.5 text-amber-600" />;
      default:
        return <Type className="w-3.5 h-3.5 text-gray-600" />;
    }
  };

  const renderTypeBadge = (type: ColumnType) => {
    const styles: Record<ColumnType, string> = {
      number: 'bg-blue-50 text-blue-700 border-blue-200',
      currency: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      date: 'bg-purple-50 text-purple-700 border-purple-200',
      boolean: 'bg-amber-50 text-amber-700 border-amber-200',
      text: 'bg-gray-100 text-gray-700 border-gray-200',
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[type]}`}>
        {renderTypeIcon(type)}
        <span className="capitalize">{type}</span>
      </span>
    );
  };

  // Filter rows
  const filteredRows = dataset.cleanedRows.filter((row) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return Object.values(row).some((val) => String(val).toLowerCase().includes(term));
  });

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const visibleRows = filteredRows.slice(startIndex, startIndex + pageSize);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-black font-['Poppins']">
              Dataset Inspection: <span className="text-[#4A148C]">{dataset.name}</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-[#4A148C] text-xs font-semibold">
              SQLite: "dataset"
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Displaying first {pageSize} rows of {dataset.cleanedRows.length.toLocaleString()} total records • {dataset.columns.length} auto-detected columns
          </p>
        </div>

        <div className="flex items-center gap-2">
          {setDataset && (
            <button
              onClick={handleOpenAddRow}
              className="px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-xs font-semibold text-[#4A148C] transition cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-[#FF6D00]" />
              <span>Add Row Manually</span>
            </button>
          )}
          <button
            onClick={onNavigateToSql}
            className="px-4 py-2 rounded-xl border border-purple-200 hover:border-[#4A148C] text-xs font-semibold text-black hover:text-[#4A148C] transition cursor-pointer"
          >
            Open in SQL Studio
          </button>
          <button
            onClick={onNavigateToDashboard}
            className="px-4 py-2 rounded-xl bg-[#FF6D00] hover:bg-[#E65100] text-xs font-semibold text-white shadow-md shadow-[#FF6D00]/20 transition cursor-pointer"
          >
            View Dashboard
          </button>
        </div>
      </div>

      {/* Add Row Manually Modal */}
      {isAddingRow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-black font-['Poppins'] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#FF6D00]" />
                <span>Enter New Record Manually</span>
              </h3>
              <button
                onClick={() => setIsAddingRow(false)}
                className="text-gray-400 hover:text-black font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
              {dataset.columns.map((col) => (
                <div key={col.name}>
                  <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                    <span>{col.name}</span>
                    <span className="text-[10px] text-gray-400 uppercase font-mono">({col.type})</span>
                  </label>
                  <input
                    type={col.type === 'number' || col.type === 'currency' ? 'number' : 'text'}
                    value={newRowValues[col.name] !== undefined ? newRowValues[col.name] : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const parsed = col.type === 'number' || col.type === 'currency' ? parseFloat(val) : val;
                      setNewRowValues((prev) => ({ ...prev, [col.name]: isNaN(parsed as any) ? val : parsed }));
                    }}
                    placeholder={`Enter ${col.name}...`}
                    className="w-full px-3 py-1.5 rounded-lg border border-purple-200 text-xs text-black focus:border-[#FF6D00] outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setIsAddingRow(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewRow}
                className="px-5 py-2 rounded-xl bg-[#FF6D00] hover:bg-[#E65100] text-white text-xs font-bold shadow-md shadow-[#FF6D00]/20 cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Append Row to Dataset</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-purple-200">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('preview')}
            className={`pb-3 px-4 text-sm font-semibold transition cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'preview'
                ? 'border-[#FF6D00] text-[#FF6D00]'
                : 'border-transparent text-gray-500 hover:text-black'
            }`}
          >
            <TableProperties className="w-4 h-4" />
            <span>Data Rows Preview ({dataset.cleanedRows.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('schema')}
            className={`pb-3 px-4 text-sm font-semibold transition cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'schema'
                ? 'border-[#FF6D00] text-[#FF6D00]'
                : 'border-transparent text-gray-500 hover:text-black'
            }`}
          >
            <Hash className="w-4 h-4" />
            <span>Schema & Column Summary ({dataset.columns.length})</span>
          </button>
        </div>

        {activeTab === 'preview' && (
          <div className="pb-2">
            <input
              type="text"
              placeholder="Search table values..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 rounded-lg border border-purple-200 text-xs text-black focus:border-[#FF6D00] outline-none w-56"
            />
          </div>
        )}
      </div>

      {/* Content based on Active Tab */}
      {activeTab === 'preview' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-purple-100 overflow-hidden">
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#4A148C] text-white sticky top-0 z-10 select-none">
                <tr>
                  <th className="py-3 px-3 w-12 text-center text-purple-200 border-r border-[#5c1c9c]">#</th>
                  {dataset.columns.map((col) => (
                    <th key={col.name} className="py-3 px-4 font-semibold tracking-wider whitespace-nowrap border-r border-[#5c1c9c]">
                      <div className="flex items-center justify-between gap-2">
                        <span>{col.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#380e6d] text-purple-200 uppercase font-mono">
                          {col.type}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-purple-50/40 transition">
                    <td className="py-2.5 px-3 text-center text-gray-400 font-mono bg-gray-50/50 border-r border-gray-100">
                      {startIndex + idx + 1}
                    </td>
                    {dataset.columns.map((col) => {
                      const val = row[col.name];
                      const isNull = val === null || val === undefined || val === '';
                      return (
                        <td
                          key={col.name}
                          className="py-2.5 px-4 whitespace-nowrap text-gray-800 border-r border-gray-100 last:border-r-0 font-mono"
                        >
                          {isNull ? (
                            <span className="text-gray-300 italic">null</span>
                          ) : col.type === 'currency' ? (
                            <span className="text-emerald-700 font-medium">
                              ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : col.type === 'boolean' ? (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${val ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                              {String(val)}
                            </span>
                          ) : (
                            String(val)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
            <div>
              Showing {startIndex + 1} to {Math.min(startIndex + pageSize, filteredRows.length)} of {filteredRows.length} rows
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-purple-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-purple-50 transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 text-black" />
              </button>
              <span className="font-semibold text-black">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-purple-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-purple-50 transition cursor-pointer"
              >
                <ChevronRight className="w-4 h-4 text-black" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Schema Inspection View */
        <div className="bg-white rounded-2xl shadow-sm border border-purple-100 overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#4A148C] text-white select-none">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Column Name</th>
                <th className="py-3.5 px-4 font-semibold">Detected Data Type</th>
                <th className="py-3.5 px-4 font-semibold">Missing Values</th>
                <th className="py-3.5 px-4 font-semibold">Distinct Values</th>
                <th className="py-3.5 px-4 font-semibold">Min / Max Range</th>
                <th className="py-3.5 px-4 font-semibold">Sample Distinct Values</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dataset.columns.map((col) => (
                <tr key={col.name} className="hover:bg-purple-50/40 transition">
                  <td className="py-3 px-4 font-bold text-black font-mono">
                    "{col.name}"
                  </td>
                  <td className="py-3 px-4">
                    {renderTypeBadge(col.type)}
                  </td>
                  <td className="py-3 px-4">
                    {col.nullCount > 0 ? (
                      <span className="text-amber-600 font-semibold font-mono">
                        {col.nullCount} ({Math.round((col.nullCount / dataset.cleanedRows.length) * 100)}%)
                      </span>
                    ) : (
                      <span className="text-emerald-600 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 0 (100% complete)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-gray-700">
                    {col.uniqueCount.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-mono text-gray-600">
                    {col.min !== undefined && col.max !== undefined
                      ? `${col.min} → ${col.max}`
                      : '—'}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {col.sampleValues.map((v, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-mono truncate max-w-[150px]"
                          title={String(v)}
                        >
                          {String(v)}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
