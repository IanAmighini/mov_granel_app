import React, { createContext, useState, useContext, useEffect } from 'react';
import { sheetsClient } from '@/api/sheetsClient';
import { sessionExpiresAt, sessionExpired } from '@/api/db';
import { loginUrlConRetorno } from '@/lib/authReturnTo';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    checkUserAuth();
  }, []);

  const checkUserAuth = () => {
    setIsLoadingAuth(true);
    const currentUser = sheetsClient.auth.me();
    if (currentUser) {
      setUser(currentUser);
      setIsAuthenticated(true);
    } else {
      setUser(null);
      setIsAuthenticated(false);
    }
    setIsLoadingAuth(false);
  };

  // La sesión dura 8 horas. Si se vencía con la pestaña abierta, la app seguía
  // mostrando todo como si nada y recién fallaba al guardar: había que ir al
  // /login escribiéndolo a mano. Ahora se corta sola.
  useEffect(() => {
    if (!isAuthenticated) return;

    const vencer = () => {
      sheetsClient.auth.logout();
      window.location.href = loginUrlConRetorno();
    };
    const revisar = () => {
      if (sessionExpired()) vencer();
    };

    // setTimeout no alcanza solo: una pestaña en segundo plano frena sus timers
    // y una máquina suspendida no los despierta. Por eso además se revisa cada
    // vez que la pestaña vuelve al frente, que es justo cuando se retoma el
    // trabajo. El tope de 2^31 es el máximo que aguanta setTimeout.
    const vence = sessionExpiresAt();
    const restante = vence === null ? null : vence - Date.now();
    const timer =
      restante !== null && restante < 2 ** 31
        ? setTimeout(vencer, Math.max(restante, 0))
        : null;
    document.addEventListener('visibilitychange', revisar);
    window.addEventListener('focus', revisar);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', revisar);
      window.removeEventListener('focus', revisar);
    };
  }, [isAuthenticated]);

  const login = async (email, password) => {
    const result = await sheetsClient.auth.login(email, password);
    if (result.success) {
      setUser(result.user);
      setIsAuthenticated(true);
    }
    return result;
  };

  const logout = () => {
    sheetsClient.auth.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isAdmin: user?.role === 'admin',
      login,
      logout,
      navigateToLogin,
      checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};