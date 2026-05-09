import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ClientProvider} from './Client.ts';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClientProvider>
      <App />
    </ClientProvider>
  </StrictMode>,
);
