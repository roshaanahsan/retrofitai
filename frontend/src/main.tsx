import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initBackground } from './lib/background-init';
import './index.css';

initBackground();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
