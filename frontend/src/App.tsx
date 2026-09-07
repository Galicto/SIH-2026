import { SupportedWallet, WalletId, WalletManager, WalletProvider, NetworkId } from '@txnlab/use-wallet-react'
import { SnackbarProvider, closeSnackbar } from 'notistack'
import { PredXProvider } from './context/PredXContext'
import { AnalysisProvider } from './context/AnalysisContext'
import AppRouter from './pages/AppRouter'
import PostLoginWidgets from './components/PostLoginWidgets'

const supportedWallets: SupportedWallet[] = [
  { id: WalletId.DEFLY },
  { id: WalletId.PERA, options: { compactMode: true } },
  { id: WalletId.EXODUS },
  { id: WalletId.LUTE, options: { siteName: 'Vyapar-Mitra' } },
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
          <AnalysisProvider>
            <AppRouter />
            <PostLoginWidgets />
          </AnalysisProvider>
        </PredXProvider>
      </WalletProvider>
    </SnackbarProvider>
  )
}
