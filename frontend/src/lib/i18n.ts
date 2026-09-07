/**
 * i18n.ts — Lightweight English/Hindi toggle for Arthniti
 * 
 * Only covers Arthniti internal authenticated screens.
 * Does NOT modify login/loading/wallet UI strings.
 */

import { useState, useCallback } from 'react';

export type Language = 'en' | 'hi';

const LANG_STORAGE_KEY = 'arthniti-language';

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  const saved = sessionStorage.getItem(LANG_STORAGE_KEY);
  return saved === 'hi' ? 'hi' : 'en';
}

// ── Dictionary ─────────────────────────────────────────────────────

const dictionary: Record<string, { en: string; hi: string }> = {
  // Navigation
  'nav.advisory': { en: 'Business Advisory', hi: 'व्यवसाय सलाह' },
  'nav.feasibility': { en: 'Feasibility Report', hi: 'व्यवहार्यता रिपोर्ट' },
  'nav.financialPlan': { en: 'Financial Plan', hi: 'वित्तीय योजना' },
  'nav.chat': { en: 'Chat Assistant', hi: 'चैट सहायक' },
  'nav.compare': { en: 'Compare Businesses', hi: 'व्यवसायों की तुलना' },
  'nav.arthniti': { en: 'Vyapar-Mitra', hi: 'व्यापार-मित्र' },
  'nav.tools': { en: 'Tools', hi: 'उपकरण' },

  // Advisory Page
  'advisory.title': { en: 'Business Advisory', hi: 'व्यवसाय सलाह' },
  'advisory.subtitle': { en: 'Get a personalized feasibility report and financial plan for your business idea', hi: 'अपने व्यवसाय विचार के लिए एक व्यक्तिगत व्यवहार्यता रिपोर्ट और वित्तीय योजना प्राप्त करें' },
  'advisory.district': { en: 'Select District', hi: 'जिला चुनें' },
  'advisory.districtPlaceholder': { en: 'Choose your district...', hi: 'अपना जिला चुनें...' },
  'advisory.category': { en: 'Business Category', hi: 'व्यवसाय श्रेणी' },
  'advisory.categoryPlaceholder': { en: 'Choose business type...', hi: 'व्यवसाय प्रकार चुनें...' },
  'advisory.margin': { en: 'Available Margin Capital (₹)', hi: 'उपलब्ध मार्जिन पूंजी (₹)' },
  'advisory.marginPlaceholder': { en: 'e.g. 50000', hi: 'उदा. 50000' },
  'advisory.marginHint': { en: 'This is the amount you can invest from your own savings (typically 10% of project cost)', hi: 'यह वह राशि है जो आप अपनी बचत से निवेश कर सकते हैं (आमतौर पर परियोजना लागत का 10%)' },
  'advisory.businessName': { en: 'Business Name (Optional)', hi: 'व्यवसाय का नाम (वैकल्पिक)' },
  'advisory.businessNamePlaceholder': { en: 'e.g. Lakshmi Dairy Farm', hi: 'उदा. लक्ष्मी डेयरी फार्म' },
  'advisory.generate': { en: 'Generate Business Plan', hi: 'व्यवसाय योजना बनाएं' },
  'advisory.generating': { en: 'Generating Report...', hi: 'रिपोर्ट बन रही है...' },
  'advisory.demoLabel': { en: '(Demo / Representative Data)', hi: '(डेमो / प्रतिनिधि डेटा)' },
  'advisory.compareBtn': { en: 'Compare Business Options', hi: 'व्यवसाय विकल्पों की तुलना करें' },

  // Validation
  'validation.districtRequired': { en: 'Please select a district', hi: 'कृपया एक जिला चुनें' },
  'validation.categoryRequired': { en: 'Please select a business category', hi: 'कृपया एक व्यवसाय श्रेणी चुनें' },
  'validation.marginRequired': { en: 'Please enter your available margin capital', hi: 'कृपया अपनी उपलब्ध मार्जिन पूंजी दर्ज करें' },
  'validation.marginPositive': { en: 'Margin capital must be greater than ₹0', hi: 'मार्जिन पूंजी ₹0 से अधिक होनी चाहिए' },

  // Feasibility Report
  'feasibility.title': { en: 'Feasibility Report', hi: 'व्यवहार्यता रिपोर्ट' },
  'feasibility.viabilityScore': { en: 'Viability Score', hi: 'व्यवहार्यता स्कोर' },
  'feasibility.marketReach': { en: 'Market Reach', hi: 'बाजार पहुंच' },
  'feasibility.opportunities': { en: 'Opportunities', hi: 'अवसर' },
  'feasibility.swot': { en: 'SWOT Analysis', hi: 'SWOT विश्लेषण' },
  'feasibility.strengths': { en: 'Strengths', hi: 'ताकत' },
  'feasibility.weaknesses': { en: 'Weaknesses', hi: 'कमज़ोरियां' },
  'feasibility.swotOpportunities': { en: 'Opportunities', hi: 'अवसर' },
  'feasibility.threats': { en: 'Threats', hi: 'खतरे' },
  'feasibility.risks': { en: 'Key Risks', hi: 'प्रमुख जोखिम' },
  'feasibility.competitors': { en: 'Competitor Summary', hi: 'प्रतिस्पर्धी सारांश' },
  'feasibility.pricing': { en: 'Pricing Recommendation', hi: 'मूल्य निर्धारण सिफारिश' },
  'feasibility.recommendations': { en: 'Top Recommendations', hi: 'शीर्ष सिफारिशें' },
  'feasibility.disclaimer': { en: 'This report is AI-generated advisory support for informational purposes only. It is NOT a lending decision, guarantee, or official government recommendation. Please consult your nearest bank branch or channelizing agency before applying for any scheme.', hi: 'यह रिपोर्ट केवल सूचनात्मक उद्देश्यों के लिए AI-जनित सलाहकार सहायता है। यह ऋण निर्णय, गारंटी, या आधिकारिक सरकारी अनुशंसा नहीं है। किसी भी योजना के लिए आवेदन करने से पहले कृपया अपनी निकटतम बैंक शाखा से परामर्श करें।' },
  'feasibility.loading': { en: 'Analyzing your business opportunity...', hi: 'आपके व्यवसाय अवसर का विश्लेषण हो रहा है...' },
  'feasibility.error': { en: 'Unable to generate full AI analysis. Showing demo results.', hi: 'पूर्ण AI विश्लेषण उत्पन्न करने में असमर्थ। डेमो परिणाम दिखा रहे हैं।' },
  'feasibility.consumerBase': { en: 'Estimated Consumer Base (5-10 km)', hi: 'अनुमानित उपभोक्ता आधार (5-10 किमी)' },
  'feasibility.unservedNiche': { en: 'Unserved Niche', hi: 'अछूता अवसर' },
  'feasibility.safeEligible': { en: 'may be eligible based on the information provided', hi: 'प्रदान की गई जानकारी के आधार पर पात्र हो सकता है' },
  'feasibility.safeSource': { en: 'Source: curated official scheme-rule pack; verify current terms with the SCA/bank.', hi: 'स्रोत: आधिकारिक योजना-नियम पैक; SCA/बैंक से सत्यापित करें।' },

  // Financial Plan
  'financial.title': { en: 'Financial Plan', hi: 'वित्तीय योजना' },
  'financial.projectCost': { en: 'Total Project Cost', hi: 'कुल परियोजना लागत' },
  'financial.applicantMargin': { en: 'Applicant Margin (10%)', hi: 'आवेदक मार्जिन (10%)' },
  'financial.loanAmount': { en: 'May Be Eligible For', hi: 'के लिए पात्र हो सकता है' },
  'financial.scheme': { en: 'Recommended Scheme', hi: 'अनुशंसित योजना' },
  'financial.interestRate': { en: 'Annual Interest Rate', hi: 'वार्षिक ब्याज दर' },
  'financial.tenure': { en: 'Loan Tenure', hi: 'ऋण अवधि' },
  'financial.moratorium': { en: 'Moratorium Period', hi: 'मोरेटोरियम अवधि' },
  'financial.emi': { en: 'Monthly EMI', hi: 'मासिक EMI' },
  'financial.moratoriumNote': { en: 'During the moratorium period, interest accrues and is capitalized (added to principal). EMI payments begin after the moratorium ends.', hi: 'मोरेटोरियम अवधि के दौरान, ब्याज जमा होता है और मूलधन में जुड़ जाता है। EMI भुगतान मोरेटोरियम समाप्त होने के बाद शुरू होता है।' },
  'financial.totalRepayment': { en: 'Total Repayment', hi: 'कुल भुगतान' },
  'financial.totalInterest': { en: 'Total Interest Paid', hi: 'कुल ब्याज भुगतान' },
  'financial.repaymentSchedule': { en: 'Quarterly Repayment Schedule', hi: 'तिमाही भुगतान अनुसूची' },
  'financial.amortization': { en: 'Amortization Chart', hi: 'परिशोधन चार्ट' },
  'financial.downloadPDF': { en: 'Download Viability Passport', hi: 'व्यवहार्यता पासपोर्ट डाउनलोड करें' },
  'financial.years': { en: 'years', hi: 'वर्ष' },
  'financial.months': { en: 'months', hi: 'महीने' },
  'financial.cappedNote': { en: 'Loan capped at scheme maximum', hi: 'ऋण योजना की अधिकतम सीमा पर सीमित' },
  'financial.notEligible': { en: 'Not Eligible', hi: 'पात्र नहीं' },
  'financial.moratoriumInterest': { en: 'Moratorium Interest (Capitalized)', hi: 'मोरेटोरियम ब्याज (पूंजीकृत)' },

  // Chat
  'chat.title': { en: 'Vyapar-Mitra Assistant', hi: 'व्यापार-मित्र सहायक' },
  'chat.placeholder': { en: 'Ask about schemes, EMI, eligibility...', hi: 'योजनाओं, EMI, पात्रता के बारे में पूछें...' },
  'chat.send': { en: 'Send', hi: 'भेजें' },
  'chat.thinking': { en: 'Thinking...', hi: 'सोच रहा हूँ...' },
  'chat.suggestedQuestions': { en: 'Suggested Questions', hi: 'सुझाए गए प्रश्न' },

  // Compare
  'compare.title': { en: 'Business Comparison', hi: 'व्यवसाय तुलना' },
  'compare.subtitle': { en: 'Evaluate alternatives objectively before choosing.', hi: 'चुनने से पहले विकल्पों का निष्पक्ष मूल्यांकन करें।' },
  'compare.recommended': { en: 'Recommended for you', hi: 'आपके लिए अनुशंसित' },
  'compare.viewReport': { en: 'View Full Report', hi: 'पूरी रिपोर्ट देखें' },
  'compare.confidence': { en: 'Confidence Level', hi: 'विश्वास स्तर' },
  'compare.competition': { en: 'Competition Density', hi: 'प्रतिस्पर्धा घनत्व' },
  'compare.revRange': { en: 'Est. Revenue Range', hi: 'अनुमानित राजस्व सीमा' },
  'compare.estCost': { en: 'Est. Operating Cost', hi: 'अनुमानित परिचालन लागत' },
  'compare.estSurplus': { en: 'Est. Monthly Surplus', hi: 'अनुमानित मासिक अधिशेष' },
  'compare.topRisk': { en: 'Top Risk', hi: 'शीर्ष जोखिम' },
  'compare.unserved': { en: 'Top Opportunity', hi: 'शीर्ष अवसर' },
  'compare.emiRatio': { en: 'EMI-to-Surplus Ratio', hi: 'EMI-से-अधिशेष अनुपात' },
  
  // PDF
  'pdf.disclaimer': { en: 'Advisory support only. Not a lending decision, scheme approval, or guarantee of income. Verify with the relevant SCA or bank.', hi: 'केवल सलाहकार सहायता। यह ऋण निर्णय, योजना अनुमोदन, या आय की गारंटी नहीं है। संबंधित SCA या बैंक से सत्यापित करें।' },
  'pdf.checklist': { en: 'Document Checklist', hi: 'दस्तावेज़ चेकलिस्ट' },

  // Common
  'common.back': { en: 'Back', hi: 'वापस' },
  'common.viewReport': { en: 'View Feasibility Report', hi: 'व्यवहार्यता रिपोर्ट देखें' },
  'common.viewFinancial': { en: 'View Financial Plan', hi: 'वित्तीय योजना देखें' },
  'common.welcome': { en: 'Welcome to Vyapar-Mitra', hi: 'व्यापार-मित्र में आपका स्वागत है' },
  'common.welcomeSubtitle': { en: 'AI-powered business advisory for rural micro-entrepreneurs', hi: 'ग्रामीण सूक्ष्म उद्यमियों के लिए AI-संचालित व्यवसाय सलाह' },
  'common.startAdvisory': { en: 'Start Business Advisory', hi: 'व्यवसाय सलाह शुरू करें' },
  'common.lastReport': { en: 'View Last Report', hi: 'अंतिम रिपोर्ट देखें' },
  'common.language': { en: 'हिंदी', hi: 'English' },
  'common.demoData': { en: 'Demo Data', hi: 'डेमो डेटा' },
};

// ── Hook ────────────────────────────────────────────────────────────

export function useLanguage() {
  const [lang, setLangState] = useState<Language>(getInitialLanguage);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(LANG_STORAGE_KEY, newLang);
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'en' ? 'hi' : 'en');
  }, [lang, setLang]);

  const t = useCallback((key: string): string => {
    const entry = dictionary[key];
    if (!entry) return key;
    return entry[lang] || entry.en || key;
  }, [lang]);

  return { lang, setLang, toggleLang, t };
}
