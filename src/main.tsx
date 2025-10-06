import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';  // ✅ use App.tsx, not MainApp.tsx
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
  