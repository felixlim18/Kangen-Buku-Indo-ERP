import React, { createContext, useContext, useState, useEffect } from 'react';

interface SidebarContextType {
  sidebarHidden: boolean;
  setSidebarHidden: (hidden: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  sidebarHidden: false,
  setSidebarHidden: () => {},
});

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarHidden, setSidebarHidden] = useState(false);

  return (
    <SidebarContext.Provider value={{ sidebarHidden, setSidebarHidden }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = () => useContext(SidebarContext);
