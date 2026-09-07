import jsPDF from 'jspdf';
import { BusinessItem, LocationProfile } from '../providers/types';

type PassportInput = {
  location: LocationProfile;
  business: BusinessItem;
  profile?: any;
  financialPlan: any;
  schemeMatches?: any[];
  feasibilityReport?: any;
};

const inr = (value: unknown) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
const textValue = (value: unknown, fallback = 'Not available') => typeof value === 'string' && value.trim() ? value : fallback;

export function generatePDFReport(input: PassportInput): void {
  const { location, business, profile = {}, financialPlan, feasibilityReport = {} } = input;
  const financials = financialPlan?.financials || {};
  const terms = financialPlan?.terms || {};
  const market = feasibilityReport?.marketAnalysis || {};
  const schemes = input.schemeMatches || financialPlan?.schemeMatching?.matches || [];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = width - margin * 2;
  let y = 16;

  const pageIfNeeded = (height = 18) => {
    if (y + height > 280) {
      doc.addPage();
      y = 16;
    }
  };
  const section = (title: string) => {
    pageIfNeeded(16);
    doc.setTextColor(255, 90, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(title, margin, y);
    doc.setDrawColor(255, 90, 0);
    doc.line(margin, y + 2, width - margin, y + 2);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
  };
  const paragraph = (text: string, indent = 0) => {
    const lines = doc.splitTextToSize(text, contentWidth - indent);
    pageIfNeeded(lines.length * 4 + 3);
    doc.text(lines, margin + indent, y);
    y += lines.length * 4 + 3;
  };
  const bullets = (items: unknown[]) => {
    items.filter(Boolean).forEach(item => paragraph(`• ${typeof item === 'string' ? item : JSON.stringify(item)}`, 2));
  };

  doc.setFillColor(15, 15, 20);
  doc.rect(0, 0, width, 34, 'F');
  doc.setTextColor(255, 90, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('ARTHNITI', margin, 17);
  doc.setFontSize(10);
  doc.setTextColor(220, 220, 220);
  doc.text('Viability Passport — Business & Financial Plan', margin, 25);
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleDateString('en-IN')}`, width - 52, 25);
  y = 44;

  section('1. Location and business profile');
  paragraph(`Business: ${textValue(business.name)} (${textValue(business.category)})`);
  paragraph(`Location: ${textValue(location.district)}, ${textValue(location.state)}.`);
  if (location.census?.status === 'available' && location.population != null) {
    paragraph(`Population context: ${location.population.toLocaleString('en-IN')} (${textValue(location.census.geographicLevel, 'area')}, Census ${location.census.year || 2011}).`);
  }
  paragraph(`Profile: skill level ${textValue(profile.skillLevel, 'not stated')}; workspace ${textValue(profile.businessSpace, 'not stated')}; availability ${textValue(profile.timeAvailability, 'not stated')}.`);

  section('2. Demand and customer segments');
  paragraph(`Demand score: ${market?.demand?.score ?? business.demandProxyScore ?? 'Not available'}/100. ${textValue(market?.demand?.summary, business.signals || 'Local demand signals were not available.')}`);
  if (market?.demand?.competition) paragraph(`Competition: ${market.demand.competition}${market.demand.competitorCount != null ? ` (${market.demand.competitorCount} nearby listings)` : ''}.`);
  if (Array.isArray(market?.demand?.localSignals) && market.demand.localSignals.length) paragraph(`Local anchors: ${market.demand.localSignals.join(', ')}.`);
  doc.setFont('helvetica', 'bold');
  paragraph('Likely customer segments:');
  doc.setFont('helvetica', 'normal');
  bullets(market?.customerSegments || ['Validate customer segments through local interviews before investing.']);

  section('3. Cost, break-even and credit plan');
  paragraph(`Startup project cost: ${inr(financials.projectCost)}. Own margin used: ${inr(financials.applicantMargin)}. Required credit: ${inr(financials.requiredCredit)}.`);
  paragraph(`Monthly revenue estimate: ${inr(financials.monthlyRevenue)}. Operating cost: ${inr(financials.monthlyOperatingCost)}. Household expenses: ${inr(financials.householdExpenses)}. Projected monthly surplus: ${inr(financials.monthlySurplus)}.`);
  paragraph(`EMI: ${inr(financials.monthlyEmi)} per month at ${financials.annualInterestRate ?? '—'}% for ${financials.tenureMonths ?? '—'} months. EMI-to-surplus: ${financials.emiToSurplusRatio ?? '—'}%.`);
  paragraph(`Terms source: ${terms.termSource === 'published_scheme_terms' ? `published terms for ${terms.schemeName || 'the matched scheme'}` : 'indicative lender-neutral planning assumption'}. ${textValue(terms.termNote, '')}`);
  if (market?.breakEven) {
    paragraph(`Monthly revenue needed to cover operating cost, household expenses and EMI: ${inr(market.breakEven.monthlyRevenueNeeded)}. ${market.breakEven.estimatedCapitalRecoveryMonths ? `Simple estimated capital recovery: ${market.breakEven.estimatedCapitalRecoveryMonths} months.` : 'Capital recovery cannot be estimated until projected monthly surplus is positive.'}`);
  }

  section('4. Risks and mitigations');
  const risks = Array.isArray(market?.risksAndMitigations) ? market.risksAndMitigations : [];
  if (risks.length) risks.forEach((item: any) => paragraph(`Risk: ${textValue(item?.risk)} Mitigation: ${textValue(item?.mitigation)}`));
  else paragraph('Validate pricing, supplier quotations, customer demand and lender terms before borrowing.');

  section('5. Schemes and next steps');
  if (schemes.length) {
    schemes.forEach((scheme: any) => {
      paragraph(`${textValue(scheme?.name)} — ${textValue(scheme?.whyRelevant, scheme?.description || 'Review eligibility on the official portal.')}`);
      if (scheme?.officialUrl) paragraph(`Official source: ${scheme.officialUrl}`, 2);
      if (scheme?.financeTerms?.note) paragraph(`Credit note: ${scheme.financeTerms.note}`, 2);
    });
  } else {
    paragraph('No scheme match was confirmed. Final rate and tenure must be obtained from a participating lender.');
  }
  bullets(market?.nextSteps || [
    'Validate supplier quotations and at least ten prospective customers.',
    'Start at the minimum-cost scale and keep business and household cash flows separate.',
    'Confirm final lender terms before accepting any credit offer.',
  ]);

  pageIfNeeded(20);
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y, width - margin, y);
  y += 5;
  doc.setTextColor(95, 95, 95);
  doc.setFontSize(7);
  paragraph('Disclaimer: This passport is an advisory estimate, not a loan sanction, guarantee, or formal scheme-eligibility decision. Verify business costs, Census context, scheme rules, and final credit terms with official sources and the lender.');
  doc.save('Arthniti_Viability_Passport.pdf');
}
