import { createWeb3Modal } from '@web3modal/wagmi/react';
import { defaultWagmiConfig } from '@web3modal/wagmi';
import { mainnet } from 'viem/chains';
import { bsc } from 'viem/chains';

/**
 * Web3Modal / wagmi configuration.
 *
 * The DUYS native token lives on the BNB Smart Chain, so the default chain is BSC.
 * The project ID is provided by WalletConnect Cloud (VITE_WALLETCONNECT_PROJECT_ID).
 */

const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'missing-wc-project-id';

const metadata = {
  name: 'DUYS',
  description: 'DUYS Social Platform',
  url: 'https://duys.app',
  icons: ['https://duys.app/og.png'],
};

// Default wagmi config with MetaMask + WalletConnect
const chains = [bsc, mainnet];
const wagmiConfig = defaultWagmiConfig({ chains, projectId: WALLETCONNECT_PROJECT_ID, metadata });

// One-time Web3Modal initialization
createWeb3Modal({
  wagmiConfig,
  projectId: WALLETCONNECT_PROJECT_ID,
  chains,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#F59E1B',
    '--w3m-color-mixing-strength': 30,
  },
});

export { wagmiConfig, chains };