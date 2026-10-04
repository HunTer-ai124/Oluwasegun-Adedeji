import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { ChartConfig, KPIMetric } from '../types';

export interface DashboardExportOptions {
  datasetName?: string;
  rowCount?: number;
  businessProblem?: string;
  businessObjectives?: string;
  kpis: KPIMetric[];
  charts: ChartConfig[];
  dashboardElement?: HTMLElement;
}

/**
 * Universal browser file download helper using Blob URL and hidden anchor tag.
 * Works seamlessly in iframes, standalone tabs, and restricted browser environments.
 */
export function downloadPdf(pdf: jsPDF, filename: string): { blobUrl: string; filename: string } {
  const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  let blobUrl = '';

  try {
    const blob = pdf.output('blob');
    blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = cleanFilename;
    link.setAttribute('download', cleanFilename);
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 2000);
  } catch (err) {
    console.warn('Blob URL download failed, falling back to pdf.save:', err);
    try {
      pdf.save(cleanFilename);
    } catch (saveErr) {
      console.warn('pdf.save failed:', saveErr);
    }
  }

  return { blobUrl, filename: cleanFilename };
}

/**
 * Download a canvas or image data URL as a PNG file
 */
export function downloadImage(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (document.body.contains(link)) {
      document.body.removeChild(link);
    }
  }, 2000);
}

/**
 * Reliably capture an element or SVG chart as a PNG data URL.
 * Handles Recharts SVG surfaces directly and falls back gracefully to html2canvas.
 */
export async function captureElementImage(element: HTMLElement | null): Promise<string | null> {
  if (!element) return null;

  // 1. First attempt: Direct SVG extraction (100% immune to CSS parsing or oklch issues)
  const svg = element.querySelector('svg.recharts-surface') || element.querySelector('svg');
  if (svg) {
    try {
      const clonedSvg = svg.cloneNode(true) as SVGElement;
      const bBox = svg.getBoundingClientRect();
      const w = Math.max(Math.round(bBox.width), 480);
      const h = Math.max(Math.round(bBox.height), 260);

      clonedSvg.setAttribute('width', String(w));
      clonedSvg.setAttribute('height', String(h));
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      const xml = new XMLSerializer().serializeToString(clonedSvg);
      const svgBase64 = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

      const img = new Image();
      const dataUrl = await new Promise<string>((resolve) => {
        const timeout = setTimeout(() => {
          resolve('');
        }, 800);
        img.onload = () => {
          clearTimeout(timeout);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = w * 2;
            canvas.height = h * 2;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL('image/png'));
            } else {
              resolve('');
            }
          } catch {
            resolve('');
          }
        };
        img.onerror = () => {
          clearTimeout(timeout);
          resolve('');
        };
        img.src = svgBase64;
      });

      if (dataUrl) return dataUrl;
    } catch (svgErr) {
      console.warn('Direct SVG capture fallback:', svgErr);
    }
  }

  // 2. Second attempt: html2canvas with defensive configuration
  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#FFFFFF',
      ignoreElements: (el) => {
        return (
          el.tagName === 'BUTTON' ||
          el.tagName === 'SELECT' ||
          el.classList.contains('ignore-pdf')
        );
      },
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('html2canvas capture failed:', err);
    return null;
  }
}

/**
 * Format KPI values safely for PDF presentation
 */
export function formatKpiValueForPdf(val: any, format: string): string {
  if (val === null || val === undefined || val === 'N/A' || val === 'NaN' || val === '') {
    return '0';
  }
  const cleanStr = String(val).replace(/[$,%]/g, '').trim();
  const num = Number(cleanStr);
  if (isNaN(num)) return String(val);

  if (format === 'currency') {
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: num % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}`;
  }
  if (format === 'percent') {
    const p = num > 1 ? num : num * 100;
    return `${p.toFixed(1)}%`;
  }
  return num.toLocaleString();
}

/**
 * Export an individual chart card as a clean, publication-grade PDF report
 */
export async function exportChartToPdf(
  chartElement: HTMLElement | null,
  chart: ChartConfig,
  datasetName?: string
): Promise<{ blobUrl: string; filename: string }> {
  const chartImgData = await captureElementImage(chartElement);

  const pdf = new jsPDF('l', 'mm', 'a4'); // Landscape A4: 297mm x 210mm
  const pageWidth = 297;
  const pageHeight = 210;

  // Header Banner: Deep Imperial Purple (#4A148C)
  pdf.setFillColor(74, 20, 140);
  pdf.rect(0, 0, pageWidth, 22, 'F');

  // Vibrant Orange Accent Strip (#FF6D00)
  pdf.setFillColor(255, 109, 0);
  pdf.rect(0, 22, pageWidth, 2.5, 'F');

  // Header Title
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('InsightLab Analytics Report', 14, 14);

  // Timestamp & Dataset metadata
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(230, 210, 255);
  const nowStr = new Date().toLocaleString();
  pdf.text(`Dataset: ${datasetName || 'Active Table'} | Generated: ${nowStr}`, pageWidth - 14, 14, { align: 'right' });

  // Chart Title
  pdf.setTextColor(10, 10, 10);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text(chart.title, 14, 35);

  // Chart Type & Axes subtitle
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text(`Type: ${chart.chartType.toUpperCase()} | X-Axis: ${chart.xKey} | Metrics: ${chart.yKeys.join(', ')}`, 14, 41);

  // Render Visual Chart Image or Data Table Fallback
  const chartMaxWidth = 185;
  const chartMaxHeight = 135;

  if (chartImgData) {
    pdf.addImage(chartImgData, 'PNG', 14, 47, chartMaxWidth, chartMaxHeight, '', 'FAST');
  } else if (chart.data && chart.data.length > 0) {
    // Elegant fallback table if image capture is restricted
    pdf.setFillColor(248, 245, 252);
    pdf.roundedRect(14, 47, chartMaxWidth, chartMaxHeight, 3, 3, 'F');
    pdf.setTextColor(74, 20, 140);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Aggregated Data Summary:', 20, 56);

    let rowY = 64;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(40, 40, 40);
    pdf.text(chart.xKey, 20, rowY);
    pdf.text(chart.yKeys[0] || 'Value', 100, rowY);
    rowY += 6;

    pdf.setFont('helvetica', 'normal');
    chart.data.slice(0, 12).forEach((row) => {
      pdf.text(String(row[chart.xKey] ?? 'Other').slice(0, 30), 20, rowY);
      pdf.text(String(row[chart.yKeys[0]] ?? '0'), 100, rowY);
      rowY += 5.5;
    });
  }

  // Side Panel: AI Insight & SQL Query
  const sideX = 205;
  const sideWidth = 78;

  // AI Insight Box
  pdf.setFillColor(237, 231, 246); // Light purple #EDE7F6
  pdf.roundedRect(sideX, 47, sideWidth, 48, 3, 3, 'F');

  pdf.setTextColor(74, 20, 140);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.text('Executive AI Insight:', sideX + 4, 55);

  pdf.setTextColor(30, 30, 30);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  const splitCaption = pdf.splitTextToSize(chart.caption || 'Insight analysis on key metrics.', sideWidth - 8);
  pdf.text(splitCaption, sideX + 4, 62);

  // SQL Query Box
  pdf.setFillColor(245, 245, 245);
  pdf.roundedRect(sideX, 100, sideWidth, 82, 3, 3, 'F');

  pdf.setTextColor(74, 20, 140);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.text('Underlying SQLite Query:', sideX + 4, 108);

  pdf.setTextColor(50, 50, 50);
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(7);
  const splitSql = pdf.splitTextToSize(chart.sql, sideWidth - 8);
  pdf.text(splitSql.slice(0, 16), sideX + 4, 115);

  // Footer bar
  pdf.setFillColor(245, 245, 245);
  pdf.rect(0, pageHeight - 9, pageWidth, 9, 'F');
  pdf.setTextColor(120, 120, 120);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text('Confidential - InsightLab Automated In-Browser Data Analytics & SQL Engine', 14, pageHeight - 3.5);
  pdf.text('Page 1 of 1', pageWidth - 14, pageHeight - 3.5, { align: 'right' });

  const safeTitle = (chart.title || 'Chart').replace(/[^a-zA-Z0-9_-]/g, '_');
  return downloadPdf(pdf, `InsightLab_Chart_${safeTitle}.pdf`);
}

/**
 * Export the full executive dashboard as a publication-grade multi-page PDF report
 */
export async function exportDashboardToPdf(options: DashboardExportOptions): Promise<{ blobUrl: string; filename: string }> {
  const {
    datasetName = 'Dataset',
    rowCount = 0,
    businessProblem = '',
    businessObjectives = '',
    kpis = [],
    charts = [],
  } = options;

  const pdf = new jsPDF('p', 'mm', 'a4'); // Portrait A4: 210mm x 297mm
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 186mm

  const nowStr = new Date().toLocaleString();

  // Helper to draw the top header banner on any page
  const drawPageHeader = (pageNumber: number, totalPages: number) => {
    pdf.setFillColor(74, 20, 140); // #4A148C Deep Purple
    pdf.rect(0, 0, pageWidth, 20, 'F');

    pdf.setFillColor(255, 109, 0); // #FF6D00 Accent Orange
    pdf.rect(0, 20, pageWidth, 2, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('InsightLab - Executive Analytics Dashboard', margin, 12);

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(230, 210, 255);
    pdf.text(`${datasetName} (${rowCount.toLocaleString()} rows) | ${nowStr}`, pageWidth - margin, 12, { align: 'right' });
  };

  // Helper to draw footer on any page
  const drawPageFooter = (pageNumber: number, totalPages: number) => {
    pdf.setFillColor(248, 245, 252);
    pdf.rect(0, pageHeight - 8, pageWidth, 8, 'F');
    pdf.setTextColor(110, 110, 110);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.text('Confidential - InsightLab Automated In-Browser Data Analytics & SQL Engine', margin, pageHeight - 3);
    pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin, pageHeight - 3, { align: 'right' });
  };

  // Pre-capture all chart visual images in parallel
  const chartImages = await Promise.all(
    charts.map(async (ch) => {
      const elem = document.getElementById(`chart-card-${ch.id}`);
      return await captureElementImage(elem);
    })
  );

  // PAGE 1: Header, Analytical Scope, KPIs, and First Chart
  drawPageHeader(1, 2);

  let currentY = 28;

  // 1. Business Context / Scope Card
  if (businessProblem || businessObjectives) {
    pdf.setFillColor(237, 231, 246); // #EDE7F6
    pdf.roundedRect(margin, currentY, contentWidth, 22, 2.5, 2.5, 'F');

    pdf.setTextColor(74, 20, 140);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.text('ANALYTICAL SCOPE & BUSINESS OBJECTIVES', margin + 3.5, currentY + 5);

    pdf.setFontSize(7.5);
    if (businessProblem) {
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(230, 81, 0); // Orange
      pdf.text('Problem: ', margin + 3.5, currentY + 10.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(40, 40, 40);
      const splitProb = pdf.splitTextToSize(businessProblem, contentWidth - 25);
      pdf.text(splitProb.slice(0, 1), margin + 17, currentY + 10.5);
    }

    if (businessObjectives) {
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(74, 20, 140);
      pdf.text('Objectives: ', margin + 3.5, currentY + 16.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(40, 40, 40);
      const splitObj = pdf.splitTextToSize(businessObjectives, contentWidth - 25);
      pdf.text(splitObj.slice(0, 1), margin + 20, currentY + 16.5);
    }

    currentY += 26;
  }

  // 2. Executive KPI Cards
  pdf.setTextColor(10, 10, 10);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.text('EXECUTIVE KEY PERFORMANCE INDICATORS', margin, currentY);
  currentY += 4;

  const kpisToRender = kpis.slice(0, 5);
  const kpiCount = Math.max(1, kpisToRender.length);
  const kpiCardWidth = (contentWidth - (kpiCount - 1) * 3) / kpiCount;
  const kpiCardHeight = 24;

  kpisToRender.forEach((kpi, kIdx) => {
    const cardX = margin + kIdx * (kpiCardWidth + 3);
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(220, 205, 240);
    pdf.roundedRect(cardX, currentY, kpiCardWidth, kpiCardHeight, 2, 2, 'FD');

    // Title
    pdf.setTextColor(90, 90, 90);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    const splitTitle = pdf.splitTextToSize(kpi.title.toUpperCase(), kpiCardWidth - 4);
    pdf.text(splitTitle[0] || '', cardX + 2.5, currentY + 4.5);

    // Value
    pdf.setTextColor(74, 20, 140);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    const formattedVal = formatKpiValueForPdf(kpi.calculatedValue, kpi.format);
    pdf.text(formattedVal, cardX + 2.5, currentY + 12);

    // Insight
    pdf.setTextColor(110, 110, 110);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5.5);
    const splitIns = pdf.splitTextToSize(kpi.insight, kpiCardWidth - 4);
    pdf.text(splitIns.slice(0, 2), cardX + 2.5, currentY + 16.5);
  });

  currentY += kpiCardHeight + 8;

  // Helper to draw a single chart card inside the PDF
  const drawChartInPdf = (chart: ChartConfig, imgData: string | null, yPos: number, height: number) => {
    // Card background
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(220, 205, 240);
    pdf.roundedRect(margin, yPos, contentWidth, height, 2.5, 2.5, 'FD');

    // Chart Title & Type Badge
    pdf.setTextColor(10, 10, 10);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(chart.title, margin + 4, yPos + 6);

    pdf.setFillColor(237, 231, 246);
    pdf.roundedRect(pageWidth - margin - 32, yPos + 2, 28, 5, 1.5, 1.5, 'F');
    pdf.setTextColor(74, 20, 140);
    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(chart.chartType.toUpperCase(), pageWidth - margin - 18, yPos + 5.5, { align: 'center' });

    // Chart Visual Image (left side)
    const chartImgW = 108;
    const chartImgH = height - 12;
    if (imgData) {
      pdf.addImage(imgData, 'PNG', margin + 3, yPos + 8, chartImgW, chartImgH, '', 'FAST');
    } else if (chart.data && chart.data.length > 0) {
      // Mini data table fallback
      pdf.setFillColor(248, 245, 252);
      pdf.roundedRect(margin + 3, yPos + 8, chartImgW, chartImgH, 2, 2, 'F');
      pdf.setTextColor(74, 20, 140);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.text(`${chart.xKey} Breakdown`, margin + 6, yPos + 14);

      let dy = yPos + 19;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.setTextColor(50, 50, 50);
      chart.data.slice(0, 6).forEach((row) => {
        pdf.text(String(row[chart.xKey] ?? 'Other').slice(0, 20), margin + 6, dy);
        pdf.text(String(row[chart.yKeys[0]] ?? '0'), margin + 70, dy);
        dy += 4.5;
      });
    }

    // Right Side: AI Insight & SQL Query boxes
    const sideW = contentWidth - chartImgW - 8;
    const sideX = margin + chartImgW + 5;

    // AI Insight Box
    pdf.setFillColor(237, 231, 246);
    pdf.roundedRect(sideX, yPos + 8, sideW, 26, 2, 2, 'F');
    pdf.setTextColor(74, 20, 140);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.text('AI Insight:', sideX + 3, yPos + 13);

    pdf.setTextColor(40, 40, 40);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    const splitCap = pdf.splitTextToSize(chart.caption || 'Insight analysis on metric.', sideW - 6);
    pdf.text(splitCap.slice(0, 4), sideX + 3, yPos + 18);

    // SQL Box
    const sqlY = yPos + 36;
    const sqlH = height - 42;
    pdf.setFillColor(245, 245, 245);
    pdf.roundedRect(sideX, sqlY, sideW, sqlH, 2, 2, 'F');
    pdf.setTextColor(74, 20, 140);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('SQLite Query:', sideX + 3, sqlY + 5);

    pdf.setTextColor(60, 60, 60);
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(5.5);
    const splitSql = pdf.splitTextToSize(chart.sql, sideW - 6);
    pdf.text(splitSql.slice(0, 7), sideX + 3, sqlY + 9.5);
  };

  // 3. Render charts on Page 1 and subsequent pages
  const chartCardHeight = 68;
  let pageNumber = 1;
  const totalPages = Math.max(1, 1 + Math.ceil(Math.max(0, charts.length - 2) / 3));

  for (let i = 0; i < charts.length; i++) {
    // Check if new chart fits on current page
    if (currentY + chartCardHeight > pageHeight - 16) {
      drawPageFooter(pageNumber, totalPages);
      pdf.addPage();
      pageNumber++;
      drawPageHeader(pageNumber, totalPages);
      currentY = 28;
    }

    drawChartInPdf(charts[i], chartImages[i], currentY, chartCardHeight);
    currentY += chartCardHeight + 5;
  }

  drawPageFooter(pageNumber, totalPages);

  const cleanName = datasetName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return downloadPdf(pdf, `InsightLab_Dashboard_${cleanName}.pdf`);
}
