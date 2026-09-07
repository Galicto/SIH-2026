import { useWallet } from '@txnlab/use-wallet-react';

// ElevenLabs voice widget (script loaded in index.html). Mounted once at the app
// root, only after a wallet is connected, so it stays hidden on the login screen
// and doesn't re-initialize on every page navigation.
export default function PostLoginWidgets() {
  const { activeAddress } = useWallet();
  if (!activeAddress) return null;
  return <elevenlabs-convai agent-id="agent_9501kpefnysyffetfexpfef822fh"></elevenlabs-convai>;
}
