import { SupportedWallet, WalletId, WalletManager, WalletProvider, NetworkId } from '@txnlab/use-wallet-react'
import { SnackbarProvider, closeSnackbar } from 'notistack'
import { PredXProvider } from './context/PredXContext'
import { AnalysisProvider } from './context/AnalysisContext'
import { AdvisoryProvider } from './context/AdvisoryContext'
import AppRouter from './pages/AppRouter'

const supportedWallets: SupportedWallet[] = [
  { id: WalletId.DEFLY },
  { id: WalletId.PERA, options: { compactMode: true } },
  { id: WalletId.EXODUS },
  { id: WalletId.LUTE, options: { siteName: 'Arthniti' } },
]

const walletManager = new WalletManager({
  wallets: supportedWallets,
  network: NetworkId.TESTNET,
})

export default function App() {
  return (
    <SnackbarProvider 
      maxSnack={3} 
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      action={(snackbarId) => (
        <button 
          onClick={() => closeSnackbar(snackbarId)} 
          className="text-on-surface hover:bg-on-surface/20 rounded-full transition-colors p-1 m-1 flex items-center justify-center bg-transparent border-none cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      )}
    >
      <WalletProvider manager={walletManager}>
        <PredXProvider>
          <AdvisoryProvider>
            <AnalysisProvider>
              <AppRouter />
            </AnalysisProvider>
          </AdvisoryProvider>
        </PredXProvider>
      </WalletProvider>
    </SnackbarProvider>
  )
}
