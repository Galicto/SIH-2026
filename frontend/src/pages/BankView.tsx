import DashboardLayout from '../components/DashboardLayout';
import Bank from '../components/Bank';
import PanelErrorBoundary from '../components/PanelErrorBoundary';
import { usePredX } from '../context/PredXContext';

// Isolated SCA / bank-side disbursement-transparency ledger.
// NOT part of the entrepreneur flow — only reachable from its own nav item.
export default function BankView() {
  const { navigate } = usePredX();
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 pt-4 pb-12">
        <h1 className="text-2xl md:text-3xl font-headline font-bold text-on-surface mb-1">SCA / Bank View</h1>
        <p className="text-on-surface/50 text-sm font-body mb-6">
          On-chain disbursement ledger for the sponsoring bank / SCA. Not shown in the entrepreneur flow.
        </p>
        <PanelErrorBoundary fallbackMessage="Bank view needs Algorand config (.env). This screen is bank-side only.">
          <Bank openModal={true} closeModal={() => navigate('home')} />
        </PanelErrorBoundary>
      </div>
    </DashboardLayout>
  );
}
