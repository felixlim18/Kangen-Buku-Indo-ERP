// Suppress benign HTMLMediaElement play() interrupted errors globally
const originalPlay = HTMLMediaElement.prototype.play;
if (originalPlay) {
  HTMLMediaElement.prototype.play = function () {
    try {
      const promise = originalPlay.apply(this, arguments as any);
      if (promise !== undefined) {
        promise.catch(error => {
          if (error.name === 'NotAllowedError' || error.message.includes('interrupted') || error.name === 'AbortError') {
            // Ignore benign media play interruption
            return;
          }
          throw error;
        });
      }
      return promise;
    } catch (e) {
      return Promise.resolve();
    }
  };
}


window.addEventListener('error', (event) => {
  if (event.message && (event.message.includes('quota') || event.message.includes('resource-exhausted') || event.message.includes('Quota'))) {
    console.warn('Suppressed global Firebase quota error:', event.message);
    event.preventDefault();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && (String(event.reason).includes('quota') || String(event.reason).includes('resource-exhausted') || String(event.reason).includes('Quota'))) {
    console.warn('Suppressed unhandled Firebase quota rejection:', event.reason);
    event.preventDefault();
  }
});

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
