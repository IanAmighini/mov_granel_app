import React, { createContext, useState, useContext, useEffect } from 'react';
import { sheetsClient } from '@/api/sheetsClient';

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