import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { Provider } from '@/components/ui/provider';
import { store, persistor } from './store';
import { PersistGate } from 'redux-persist/integration/react';
import { Provider as ReduxProvider } from 'react-redux';
import { HeadProvider } from "react-head";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReduxProvider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <Provider>
          <HeadProvider>
            {/* <Analytics /> */}
            <App />
          </HeadProvider>
        </Provider>
      </PersistGate>
    </ReduxProvider>
  </StrictMode>
)
