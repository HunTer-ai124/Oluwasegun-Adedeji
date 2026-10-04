import React, { useState } from 'react';
import {
  Table as TableIcon,
  Plus,
  Trash2,
  ClipboardPaste,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Check,
  Type,
  Hash,
  DollarSign,
  Calendar,
  ToggleLeft,
  FileSpreadsheet,
} from 'lucide-react';
import Papa from 'papaparse';
import { ColumnType } from '../types';

interface ManualDataEntryProps {
  onLoadData: (rows: Record<string, any>[], tableName: string) => void;
  onCancel?: () => void;
}

interface ColumnDef {
  id: string;
  name: string;
  type: ColumnType;
}

const TEMPLATES: Record<
  string,
  { name: string; columns: ColumnDef[]; defaultRows: Record<string, any>[] }
> = {
  sales: {
    name: 'Sales_and_Margins',
    columns: [
      { id: 'c1', name: 'OrderDate', type: 'date' },
      { id: 'c2', name: 'Product', type: 'text' },
      { id: 'c3', name: 'Category', type: 'text' },
      { id: 'c4', name: 'Units', type: 'number' },
      { id: 'c5', name: 'Price', type: 'currency' },
      { id: 'c6', name: 'Cost', type: 'currency' },
      { id: 'c7', name: 'Profit', type: 'currency' },
    ],
    defaultRows: [
      { OrderDate: '2025-01-10', Product: 'Pro Laptop 15', Category: 'Hardware', Units: 3, Price: 1200, Cost: 850, Profit: 1050 },
      { OrderDate: '2025-01-12', Product: 'Wireless Mouse', Category: 'Accessories', Units: 12, Price: 35, Cost: 18, Profit: 204 },
      { OrderDate: '2025-01-15', Product: '4K Ultra Monitor', Category: 'Hardware', Units: 4, Price: 450, Cost: 310, Profit: 560 },
      { OrderDate: '2025-01-18', Product: 'Mechanical Keyboard', Category: 'Accessories', Units: 8, Price: 95, Cost: 55, Profit: 320 },
      { OrderDate: '2025-01-20', Product: 'USB-C Dock', Category: 'Accessories', Units: 6, Price: 130, Cost: 75, Profit: 330 },
      { OrderDate: '2025-01-24', Product: 'Server Rack 1U', Category: 'Enterprise', Units: 1, Price: 2800, Cost: 1950, Profit: 850 },
    ],
  },
  customers: {
    name: 'Customer_Retention',
    columns: [
      { id: 'c1', name: 'CustomerID', type: 'text' },
      { id: 'c2', name: 'Tier', type: 'text' },
      { id: 'c3', name: 'MonthlySpend', type: 'currency' },
      { id: 'c4', name: 'SupportTickets', type: 'number' },
      { id: 'c5', name: 'NPSScore', type: 'number' },
      { id: 'c6', name: 'Churned', type: 'boolean' },
    ],
    defaultRows: [
      { CustomerID: 'CUST-101', Tier: 'Enterprise', MonthlySpend: 3200, SupportTickets: 2, NPSScore: 9, Churned: false },
      { CustomerID: 'CUST-102', Tier: 'Professional', MonthlySpend: 450, SupportTickets: 6, NPSScore: 5, Churned: true },
      { CustomerID: 'CUST-103', Tier: 'Starter', MonthlySpend: 99, SupportTickets: 1, NPSScore: 8, Churned: false },
      { CustomerID: 'CUST-104', Tier: 'Professional', MonthlySpend: 450, SupportTickets: 1, NPSScore: 10, Churned: false },
      { CustomerID: 'CUST-105', Tier: 'Enterprise', MonthlySpend: 2800, SupportTickets: 8, NPSScore: 4, Churned: true },
    ],
  },
  blank: {
    name: 'Custom_Manual_Data',
    columns: [
      { id: 'c1', name: 'Item', type: 'text' },
      { id: 'c2', name: 'Quantity', type: 'number' },
      { id: 'c3', name: 'Amount', type: 'currency' },
    ],
    defaultRows: [
      { Item: 'Alpha', Quantity: 10, Amount: 150 },
      { Item: 'Beta', Quantity: 25, Amount: 320 },
      { Item: 'Gamma', Quantity: 15, Amount: 210 },
    ],
  },
};

export const ManualDataEntry: React.FC<ManualDataEntryProps> = ({
  onLoadData,
  onCancel,
}) => {
  const [mode, setMode] = useState<'grid' | 'paste'>('grid');
  const [tableName, setTableName] = useState('Manual_Dataset');
  const [columns, setColumns] = useState<ColumnDef[]>(TEMPLATES.sales.columns);
  const [rows, setRows] = useState<Record<string, any>[]>(TEMPLATES.sales.defaultRows);

  // New Column input state
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<ColumnType>('text');
  const [showAddCol, setShowAddCol] = useState(false);

  // Raw paste area state
  const [pasteContent, setPasteContent] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [pasteError, setPasteError] = useState<string | null>(null);

  // Apply a template
  const handleApplyTemplate = (templateKey: string) => {
    const t = TEMPLATES[templateKey];
    if (!t) return;
    setTableName(t.name);
    setColumns(t.columns);
    setRows(t.defaultRows);
  };

  // Add column to grid
  const handleAddColumn = () => {
    const cleanName = newColName.trim();
    if (!cleanName) return;

    if (columns.some((c) => c.name.toLowerCase() === cleanName.toLowerCase())) {
      alert('A column with this name already exists.');
      return;
    }

    const newCol: ColumnDef = {
      id: `col-${Date.now()}`,
      name: cleanName,
      type: newColType,
    };

    setColumns((prev) => [...prev, newCol]);

    // Update existing rows with default value
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        [cleanName]: newColType === 'number' || newColType === 'currency' ? 0 : '',
      }))
    );

    setNewColName('');
    setShowAddCol(false);
  };

  // Delete column
  const handleDeleteColumn = (colId: string, colName: string) => {
    if (columns.length <= 1) {
      alert('Table must have at least one column.');
      return;
    }
    setColumns((prev) => prev.filter((c) => c.id !== colId));
    setRows((prev) =>
      prev.map((row) => {
        const copy = { ...row };
        delete copy[colName];
        return copy;
      })
    );
  };

  // Change column name
  const handleRenameColumn = (colId: string, oldName: string, newName: string) => {
    const clean = newName.trim();
    if (!clean || clean === oldName) return;

    setColumns((prev) =>
      prev.map((c) => (c.id === colId ? { ...c, name: clean } : c))
    );

    setRows((prev) =>
      prev.map((row) => {
        const copy = { ...row };
        copy[clean] = copy[oldName];
        delete copy[oldName];
        return copy;
      })
    );
  };

  // Change column type
  const handleChangeColumnType = (colId: string, type: ColumnType) => {
    setColumns((prev) =>
      prev.map((c) => (c.id === colId ? { ...c, type } : c))
    );
  };

  // Add new empty row
  const handleAddRow = () => {
    const newRow: Record<string, any> = {};
    columns.forEach((col) => {
      newRow[col.name] = col.type === 'number' || col.type === 'currency' ? 0 : '';
    });
    setRows((prev) => [...prev, newRow]);
  };

  // Delete row
  const handleDeleteRow = (index: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Update cell value
  const handleCellChange = (rowIndex: number, colName: string, value: any, type: ColumnType) => {
    let parsedVal = value;
    if (type === 'number' || type === 'currency') {
      const num = parseFloat(value);
      parsedVal = isNaN(num) ? value : num;
    } else if (type === 'boolean') {
      parsedVal = value === 'true' || value === true;
    }

    setRows((prev) => {
      const updated = [...prev];
      updated[rowIndex] = { ...updated[rowIndex], [colName]: parsedVal };
      return updated;
    });
  };

  // Parse pasted CSV or TSV data
  const handleProcessPastedData = () => {
    setPasteError(null);
    if (!pasteContent.trim()) {
      setPasteError('Please paste some text data first.');
      return;
    }

    try {
      const parsed = Papa.parse(pasteContent.trim(), {
        header: hasHeader,
        skipEmptyLines: true,
        dynamicTyping: true,
      });

      if (parsed.errors && parsed.errors.length > 0 && parsed.data.length === 0) {
        throw new Error(parsed.errors[0].message);
      }

      if (!parsed.data || parsed.data.length === 0) {
        throw new Error('No rows found in pasted text.');
      }

      let parsedRows: Record<string, any>[] = [];
      let newCols: ColumnDef[] = [];

      if (hasHeader) {
        parsedRows = parsed.data as Record<string, any>[];
        const colNames = Object.keys(parsedRows[0] || {});
        newCols = colNames.map((name, i) => ({
          id: `col-${Date.now()}-${i}`,
          name: name.trim() || `Column_${i + 1}`,
          type: 'text',
        }));
      } else {
        // Data has no header
        const rawArray = parsed.data as any[][];
        const numCols = rawArray[0].length;
        newCols = Array.from({ length: numCols }, (_, i) => ({
          id: `col-${Date.now()}-${i}`,
          name: `Column_${i + 1}`,
          type: 'text',
        }));

        parsedRows = rawArray.map((row) => {
          const rowObj: Record<string, any> = {};
          newCols.forEach((col, idx) => {
            rowObj[col.name] = row[idx] !== undefined ? row[idx] : '';
          });
          return rowObj;
        });
      }

      setColumns(newCols);
      setRows(parsedRows);
      setMode('grid');
    } catch (err: any) {
      setPasteError(err.message || 'Failed to parse pasted data.');
    }
  };

  // Submit manual dataset
  const handleSubmit = () => {
    if (rows.length === 0) {
      alert('Please add at least one row before loading.');
      return;
    }
    onLoadData(rows, tableName.trim() || 'Manual_Dataset');
  };

  const getTypeIcon = (type: ColumnType) => {
    switch (type) {
      case 'number':
        return <Hash className="w-3 h-3 text-blue-600" />;
      case 'currency':
        return <DollarSign className="w-3 h-3 text-emerald-600" />;
      case 'date':
        return <Calendar className="w-3 h-3 text-purple-600" />;
      case 'boolean':
        return <ToggleLeft className="w-3 h-3 text-amber-600" />;
      default:
        return <Type className="w-3 h-3 text-gray-600" />;
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <h3 className="text-xl font-bold text-black font-['Poppins'] flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#FF6D00]" />
            <span>Manual Data Entry & Spreadsheet Grid</span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Type values directly, add custom columns and rows, or paste data from Excel / Google Sheets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-3.5 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:text-black transition cursor-pointer"
            >
              Back to File Upload
            </button>
          )}

          <button
            onClick={handleSubmit}
            className="px-5 py-2 rounded-xl bg-[#FF6D00] hover:bg-[#E65100] text-white text-xs font-bold shadow-md shadow-[#FF6D00]/20 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Load Table & Analyze ({rows.length} rows)</span>
          </button>
        </div>
      </div>

      {/* Control Bar: Mode Toggle, Table Name, Templates */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-purple-50/50 p-4 rounded-xl border border-purple-100">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('grid')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              mode === 'grid'
                ? 'bg-[#4A148C] text-white shadow-xs'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-purple-200'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Spreadsheet Grid ({rows.length} rows, {columns.length} cols)</span>
          </button>

          <button
            onClick={() => setMode('paste')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              mode === 'paste'
                ? 'bg-[#4A148C] text-white shadow-xs'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-purple-200'
            }`}
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>Paste CSV / Excel Text</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-700">Table Name:</span>
            <input
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-purple-200 text-xs font-mono font-semibold text-black bg-white focus:border-[#FF6D00] outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Templates:
            </span>
            <button
              onClick={() => handleApplyTemplate('sales')}
              className="px-2 py-1 rounded bg-white hover:bg-purple-100 border border-purple-200 text-[11px] font-medium text-purple-900 cursor-pointer"
            >
              Sales
            </button>
            <button
              onClick={() => handleApplyTemplate('customers')}
              className="px-2 py-1 rounded bg-white hover:bg-purple-100 border border-purple-200 text-[11px] font-medium text-purple-900 cursor-pointer"
            >
              Retention
            </button>
            <button
              onClick={() => handleApplyTemplate('blank')}
              className="px-2 py-1 rounded bg-white hover:bg-purple-100 border border-purple-200 text-[11px] font-medium text-purple-900 cursor-pointer"
            >
              Blank
            </button>
          </div>
        </div>
      </div>

      {/* Grid Mode View */}
      {mode === 'grid' ? (
        <div className="space-y-4">
          {/* Action Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddRow}
                className="px-3.5 py-1.5 rounded-lg bg-[#FF6D00] hover:bg-[#E65100] text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Row</span>
              </button>

              <button
                onClick={() => setShowAddCol(!showAddCol)}
                className="px-3.5 py-1.5 rounded-lg bg-white border border-purple-200 hover:border-[#FF6D00] text-[#4A148C] text-xs font-semibold transition cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Column</span>
              </button>

              <button
                onClick={() => setRows([])}
                className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-red-600 text-xs font-medium transition cursor-pointer"
              >
                Clear All Rows
              </button>
            </div>

            <span className="text-xs text-gray-500 font-mono">
              Tip: Click any cell to edit • Values are saved live
            </span>
          </div>

          {/* Add Column Inline Form */}
          {showAddCol && (
            <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 flex items-center gap-3">
              <span className="text-xs font-bold text-[#4A148C]">New Column:</span>
              <input
                type="text"
                placeholder="Column name (e.g. Region)"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddColumn();
                }}
                className="px-3 py-1 rounded-lg border border-purple-200 text-xs text-black bg-white outline-none focus:border-[#FF6D00] w-48"
              />

              <select
                value={newColType}
                onChange={(e) => setNewColType(e.target.value as ColumnType)}
                className="px-2.5 py-1 rounded-lg border border-purple-200 text-xs bg-white text-black outline-none cursor-pointer"
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="currency">Currency ($)</option>
                <option value="date">Date (YYYY-MM-DD)</option>
                <option value="boolean">Boolean (True/False)</option>
              </select>

              <button
                onClick={handleAddColumn}
                disabled={!newColName.trim()}
                className="px-3 py-1 rounded-lg bg-[#FF6D00] text-white text-xs font-bold hover:bg-[#E65100] transition cursor-pointer disabled:opacity-50"
              >
                Add Column
              </button>

              <button
                onClick={() => setShowAddCol(false)}
                className="text-xs text-gray-400 hover:text-black cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Editable Grid Table */}
          <div className="overflow-x-auto rounded-xl border border-purple-200 max-h-[500px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#4A148C] text-white sticky top-0 z-10 select-none">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center text-purple-200 border-r border-[#5c1c9c]">#</th>
                  {columns.map((col) => (
                    <th key={col.id} className="py-2 px-3 font-semibold border-r border-[#5c1c9c] min-w-[150px]">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="text"
                            defaultValue={col.name}
                            onBlur={(e) => handleRenameColumn(col.id, col.name, e.target.value)}
                            className="bg-transparent text-white font-bold text-xs focus:bg-white/20 px-1 py-0.5 rounded outline-none w-full"
                          />
                          <button
                            onClick={() => handleDeleteColumn(col.id, col.name)}
                            className="text-purple-300 hover:text-red-400 p-0.5 transition cursor-pointer"
                            title="Delete Column"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {getTypeIcon(col.type)}
                          <select
                            value={col.type}
                            onChange={(e) => handleChangeColumnType(col.id, e.target.value as ColumnType)}
                            className="bg-[#380e6d] text-purple-200 text-[10px] rounded px-1 py-0.5 outline-none cursor-pointer border border-[#5c1c9c]"
                          >
                            <option value="text">text</option>
                            <option value="number">number</option>
                            <option value="currency">currency</option>
                            <option value="date">date</option>
                            <option value="boolean">boolean</option>
                          </select>
                        </div>
                      </div>
                    </th>
                  ))}
                  <th className="py-2.5 px-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-purple-50/50 group transition">
                    <td className="py-2 px-3 text-center text-gray-400 font-mono bg-gray-50 border-r border-gray-200 text-[11px]">
                      {rIdx + 1}
                    </td>
                    {columns.map((col) => (
                      <td key={col.id} className="p-1 border-r border-gray-200">
                        <input
                          type={col.type === 'number' || col.type === 'currency' ? 'number' : 'text'}
                          value={row[col.name] !== undefined ? row[col.name] : ''}
                          onChange={(e) => handleCellChange(rIdx, col.name, e.target.value, col.type)}
                          className="w-full px-2 py-1.5 text-xs text-black font-mono focus:bg-purple-50/70 focus:outline-none focus:ring-1 focus:ring-[#FF6D00] rounded"
                        />
                      </td>
                    ))}
                    <td className="p-1 text-center">
                      <button
                        onClick={() => handleDeleteRow(rIdx)}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition p-1 cursor-pointer"
                        title="Delete Row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center text-xs text-gray-500">
            <span>{rows.length} records ready for SQLite engine</span>
            <button
              onClick={handleAddRow}
              className="text-[#FF6D00] hover:underline font-semibold cursor-pointer"
            >
              + Click to add another row
            </button>
          </div>
        </div>
      ) : (
        /* Paste Mode View */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
              Paste Tabular Data (CSV, TSV, or Excel copy):
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
                className="rounded text-[#FF6D00] focus:ring-[#FF6D00]"
              />
              <span>First line contains column headers</span>
            </label>
          </div>

          <textarea
            rows={10}
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder="OrderDate	Product	Sales	Profit
2025-01-01	Laptops	1500	400
2025-01-02	Phones	900	250
2025-01-03	Monitors	650	180"
            className="w-full font-mono text-xs p-4 rounded-xl border border-purple-200 focus:border-[#FF6D00] focus:ring-2 focus:ring-[#FF6D00]/20 outline-none leading-relaxed"
          />

          {pasteError && (
            <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
              {pasteError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={handleProcessPastedData}
              disabled={!pasteContent.trim()}
              className="px-6 py-2.5 rounded-xl bg-[#4A148C] hover:bg-[#380e6d] text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <ClipboardPaste className="w-4 h-4 text-[#FF6D00]" />
              <span>Parse & Populate Grid</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
