"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Organization, Application } from "@/types";
import { api } from "@/lib/api";

interface AuthContextType {
  user: User | null;
  currentOrg: Organization | null;
  applications: Application[];
  selectedApp: Application | null;
  setSelectedApp: (app: Application | null) => void;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  signup: (data: { email: string; password: string; full_name?: string; organization_name?: string }) => Promise<void>;
  logout: () => void;
  refreshData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshData = async () => {
    try {
      const u = await api.getMe();
      setUser(u);
      const org = await api.getCurrentOrg();
      setCurrentOrg(org);
      const apps = await api.listApps();
      setApplications(apps);
      if (apps.length > 0 && !selectedApp) {
        setSelectedApp(apps[0]);
      }
    } catch (e) {
      setUser(null);
      setCurrentOrg(null);
      setApplications([]);
      setSelectedApp(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const login = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      const res = await api.login({ email, password: pass });
      api.setAuthToken(res.access_token);
      await refreshData();
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (data: { email: string; password: string; full_name?: string; organization_name?: string }) => {
    setIsLoading(true);
    try {
      const res = await api.signup(data);
      api.setAuthToken(res.access_token);
      await refreshData();
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    api.clearAuthToken();
    setUser(null);
    setCurrentOrg(null);
    setApplications([]);
    setSelectedApp(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        currentOrg,
        applications,
        selectedApp,
        setSelectedApp,
        isLoading,
        login,
        signup,
        logout,
        refreshData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
