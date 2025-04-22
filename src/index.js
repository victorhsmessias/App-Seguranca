import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import SecurityApp from './App';

const setupXHRInterception = () => {
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  // Sobrescrever o método open
  XMLHttpRequest.prototype.open = function(...args) {
    // Interceptar apenas chamadas para o Firebase Authentication
    if (args[1] && args[1].includes('identitytoolkit.googleapis.com')) {
      this._isFirebaseAuthRequest = true;
    }
    return originalXHROpen.apply(this, args);
  };
  
  // Sobrescrever o método send
  XMLHttpRequest.prototype.send = function(...args) {
    if (this._isFirebaseAuthRequest) {
      // Adicionar um manipulador de erro específico
      this.addEventListener('load', function() {
        if (this.status >= 400) {
          // Impedir o log de erro no console se for erro de autenticação
          // O erro ainda será tratado normalmente, mas não será logado
          const originalConsoleError = console.error;
          console.error = function() {};
          
          // Restaurar após 100ms (tempo suficiente para os logs normais)
          setTimeout(() => {
            console.error = originalConsoleError;
          }, 100);
        }
      });
    }
    return originalXHRSend.apply(this, args);
  };
};

setupXHRInterception();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <SecurityApp />
  </React.StrictMode>
);