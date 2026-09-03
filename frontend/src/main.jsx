import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { WagmiConfig } from 'wagmi';
import { wagmiConfig } from './utils/web3';

// Import Web3Modal setup early so the provider is registered before app renders
import './utils/web3';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiConfig config={wagmiConfig}>
      <App />
    </WagmiConfig>
  </React.StrictMode>
);
