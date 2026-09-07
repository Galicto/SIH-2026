import jsPDF from 'jspdf';
import type { FinancialResult } from './financialCalculator';
import { formatINR } from './financialCalculator';
import { BusinessItem, LocationProfile, SchemeMatch } from '../providers/types';

interface PDFInput {
  location: LocationProfile;
  business: BusinessItem;
  marginCapital: number;
  financials: FinancialResult;
  schemeMatches: SchemeMatch[];
}

export function generatePDFReport(input: PDFInput): void {
  const { location, business, marginCapital, financials, schemeMatches } = input;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let y = 15;

  const addPageIfNeeded = (requiredSpace: number = 30) => {
    if (y + requiredSpace > 280) {
      doc.addPage();
      y = 15;
    }
  };

  // ── Header ────────────────────────────────────────────────────
  doc.setFillColor(15, 15, 20);
  doc.rect(0, 0, pageWidth, 35, 'F');
  doc.setTextColor(255, 90, 0);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('VYAPAR-MITRA', margin, 18);
  doc.setFontSize(10);
  doc.setTextColor(220, 220, 220);
  doc.text('Viability Passport — Business & Financial Plan', margin, 26);
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, pageWidth - margin - 35, 26);

  y = 45;

  // ── 1. Location & Business Profile ───────────────────────────
  doc.setTextColor(255, 90, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Location & Business Profile', margin, y);
  doc.setDrawColor(255, 90, 0);
  doc.setLineWidth(0.3);
  doc.line(margin, y + 2, margin + contentWidth, y + 2);
  y += 8;

  doc.setTextColor(40, 40, 40);
  doc.setFontSize(9);
  const leftColX = margin;
  const rightColX = margin + (contentWidth / 2);

  doc.setFont('helvetica', 'bold');
  doc.text('Location:', leftColX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${location.district}, ${location.state}`, leftColX + 25, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Category:', rightColX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(business.category, rightColX + 25, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('Business:', leftColX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(business.name, leftColX + 25, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Skill Level:', rightColX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(business.skillLevel, rightColX + 25, y);
  y += 10;

  // ── 2. Feasibility Summary ────────────────────────────────────
  doc.setTextColor(255, 90, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('2. Feasibility Summary', margin, y);
  doc.line(margin, y + 2, margin + contentWidth, y + 2);
  y += 8;

  doc.setTextColor(40, 40, 40);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Viability Score: ${business.demandProxyScore}/100`, margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`Local Competition: ${business.competitorDensity.toUpperCase()}`, margin, y);
  y += 6;
  
  const surplus = business.avgRevenue - business.avgOperatingCost;
  const emiRatio = financials.monthlyEMI > 0 ? (financials.monthlyEMI / surplus) * 100 : 0;
  
  doc.text(`Expected Monthly Revenue: Rs. ${business.avgRevenue.toLocaleString('en-IN')}`, margin, y);
  doc.text(`Estimated Operating Cost: Rs. ${business.avgOperatingCost.toLocaleString('en-IN')}`, rightColX, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(`Estimated Surplus: Rs. ${surplus.toLocaleString('en-IN')}`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`EMI-to-Surplus Ratio: ${emiRatio.toFixed(1)}%`, rightColX, y);
  y += 10;

  // ── 3. Financial Structure ────────────────────────────────────
  addPageIfNeeded(40);
  doc.setTextColor(255, 90, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('3. Financial Structure', margin, y);
  doc.line(margin, y + 2, margin + contentWidth, y + 2);
  y += 8;

  doc.setTextColor(40, 40, 40);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Margin Capital: Rs. ${marginCapital.toLocaleString('en-IN')}`, margin, y);
  doc.text(`Estimated Project Cost: Rs. ${(business.avgOperatingCost * 6).toLocaleString('en-IN')}`, rightColX, y);
  y += 6;
  doc.text(`Credit Required: Rs. ${financials.principalAmount.toLocaleString('en-IN')}`, margin, y);
  doc.text(`Interest Rate: ${financials.interestRatePercent}%`, rightColX, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(`Monthly EMI: Rs. ${financials.monthlyEMI.toLocaleString('en-IN')}`, margin, y);
  doc.text(`Tenure: ${financials.tenureMonths} months`, rightColX, y);
  y += 12;

  // ── 4. Relevant Schemes ───────────────────────────────────────
  addPageIfNeeded(50);
  doc.setTextColor(255, 90, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('4. Government Scheme Matching', margin, y);
  doc.line(margin, y + 2, margin + contentWidth, y + 2);
  y += 8;

  if (schemeMatches.length > 0) {
    schemeMatches.forEach((match, index) => {
      addPageIfNeeded(30);
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`${index + 1}. ${match.scheme.name}`, margin, y);
      y += 5;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Ministry: ${match.scheme.ministry}`, margin, y);
      y += 5;
      doc.setTextColor(255, 90, 0);
      doc.text(`Why: ${match.matchReason}`, margin, y, { maxWidth: contentWidth });
      y += 8;
      doc.setTextColor(40, 40, 40);
      doc.text(`Support: ${match.indicativeSupport}`, margin, y);
      y += 5;
      doc.text(`Docs: ${match.scheme.requiredDocuments.join(', ')}`, margin, y, { maxWidth: contentWidth });
      y += 8;
    });
  } else {
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('No specific schemes matched. Visit local district office for general MSME support.', margin, y);
    y += 10;
  }

  // ── 5. Unserved Niche & Mitigation ───────────────────────────
  addPageIfNeeded(40);
  doc.setTextColor(255, 90, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('5. Market Gap & Strategy', margin, y);
  doc.line(margin, y + 2, margin + contentWidth, y + 2);
  y += 8;

  doc.setTextColor(40, 40, 40);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Unserved Niche:', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 5;
  const niche = business.competitorDensity === 'low' ? 'Target neighboring village clusters lacking this service.' : 'Differentiate through custom premium services or direct-to-home models.';
  doc.text(niche, margin, y, { maxWidth: contentWidth });
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Key Risk:', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 5;
  const risk = business.competitorDensity === 'high' ? 'High competition leading to price wars.' : 'Initial market awareness and supply chain setup.';
  doc.text(risk, margin, y, { maxWidth: contentWidth });
  y += 15;

  // ── Footer Disclaimer ─────────────────────────────────────────
  addPageIfNeeded(30);
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, margin + contentWidth, y);
  y += 5;
  
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(7);
  const disclaimer = `DISCLAIMER: This Viability Passport is an advisory tool generated based on demo/representative data for SIH. It does not constitute official approval, loan guarantee, or formal eligibility for any government scheme. Financial projections are indicative. Please verify all scheme rules with the official portal or your local bank branch.`;
  doc.text(disclaimer, margin, y, { maxWidth: contentWidth, align: 'justify' });

  doc.save('Vyapar-Mitra_Viability_Passport.pdf');
}
