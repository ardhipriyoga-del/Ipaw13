import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { 
  LayoutDashboard, Users, Clock, History, 
  FileBarChart, Settings, LogOut, Moon, Sun, Menu, Info, Receipt,
  RefreshCw, BookOpen, CloudCog, ClipboardList, Loader2, Sparkles
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { user, logout, isLoggingOut } = useAuth();
  const { rsName, rsLogo } = useAppContext();
  const { theme, setTheme } = useTheme();
  const [location] = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(true);


  const menuItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/patients', label: 'Pasien Rawat Inap', icon: Users },
    { path: '/pending', label: 'Pending Operan', icon: Clock },
    { path: '/history', label: 'Riwayat Pasien', icon: History },
    { path: '/sync-history', label: 'Riwayat Sinkronisasi', icon: RefreshCw },
    { path: '/reports', label: 'Laporan', icon: FileBarChart },
    { path: '/kasir', label: 'Pesan Kasir', icon: Receipt },
    { path: '/cloud-backup', label: 'Cloud Backup', icon: CloudCog },
    { path: '/activity-log', label: 'Log Aktivitas', icon: ClipboardList },
    { path: '/panduan', label: 'Panduan', icon: BookOpen },
    { path: '/ai-assistant', label: 'AI Assistant', icon: Sparkles },
    { path: '/settings', label: 'Pengaturan', icon: Settings },
    { path: '/about', label: 'Tentang Aplikasi', icon: Info },
  ];

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className={`
        ${isSidebarOpen ? 'w-64' : 'w-20'} 
        transition-all duration-300 ease-in-out
        bg-sidebar text-sidebar-foreground border-r border-sidebar-border
        flex flex-col shrink-0
      `}>
        {/* Sidebar header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border gap-2">
          {isSidebarOpen && (
            <div className="flex items-center gap-2.5 min-w-0">
              {/* EMC cross icon */}
              <div className="w-7 h-7 shrink-0 relative">
                <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                  <rect x="3" y="10" width="22" height="8" rx="2" fill="hsl(186,100%,60%)"/>
                  <rect x="10" y="3" width="8" height="22" rx="2" fill="hsl(186,100%,60%)"/>
                </svg>
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm text-white truncate leading-tight">
                  IP Admission Workspace
                </div>
                {rsName && (
                  <div className="text-xs text-sidebar-foreground/60 truncate leading-tight">
                    {rsName}
                  </div>
                )}
              </div>
            </div>
          )}
          {!isSidebarOpen && (
            <div className="mx-auto">
              <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-6 h-6">
                <rect x="3" y="10" width="22" height="8" rx="2" fill="hsl(186,100%,60%)"/>
                <rect x="10" y="3" width="8" height="22" rx="2" fill="hsl(186,100%,60%)"/>
              </svg>
            </div>
          )}
          <Button
            variant="ghost" size="icon"
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
            return (
              <Link key={item.path} href={item.path}>
                <div className={`
                  flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors
                  ${isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm' : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}
                `}>
                  <Icon className="h-5 w-5 shrink-0" />
                  {isSidebarOpen && <span className="truncate">{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-4">
          {isSidebarOpen && (
            <div className="bg-sidebar-accent rounded-md p-3">
              <p className="text-sm font-medium truncate">{user?.namaLengkap}</p>
              <p className="text-xs text-sidebar-foreground/70 uppercase tracking-wider">{user?.role}</p>
            </div>
          )}
          
          <div className={`flex ${isSidebarOpen ? 'justify-between' : 'flex-col gap-2 items-center'}`}>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-sidebar-foreground hover:bg-sidebar-accent"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => void logout()}
              disabled={isLoggingOut}
              className="text-sidebar-foreground hover:bg-destructive hover:text-destructive-foreground"
              title={isLoggingOut ? 'Menyimpan backup ke Cloud...' : 'Logout'}
            >
              {isLoggingOut ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <LogOut className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
        
        {/* Footer */}
        <footer className="h-10 shrink-0 border-t bg-card text-card-foreground flex items-center justify-between px-6 text-xs text-muted-foreground font-medium">
          <div className="flex items-center gap-1.5">
            {rsLogo ? (
              <img src={rsLogo} alt="Logo" className="w-3.5 h-3.5 object-contain" />
            ) : (
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-primary">
                <rect x="6" y="24" width="52" height="16" rx="4" fill="currentColor"/>
                <rect x="24" y="6" width="16" height="52" rx="4" fill="currentColor"/>
              </svg>
            )}
            <span>© 2026 IP Admission Workspace</span>
          </div>
          <div>Version 1.0.0</div>
          <div className="hidden sm:block">Developed by Dedi Supriadi · All Rights Reserved.</div>
        </footer>
      </main>
    </div>
  );
};
