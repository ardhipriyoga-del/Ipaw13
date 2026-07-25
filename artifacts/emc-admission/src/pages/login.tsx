import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { getDB } from '../lib/db';
import { hashPassword } from '../lib/auth';
import { writeLog } from '../lib/writeLog';
import { restoreCloud } from '../lib/cloudSync';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldAlert, Eye, EyeOff, CloudDownload, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const { login, user } = useAuth();
  const { rsLogo, refreshSettings } = useAppContext();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user) setLocation('/');
  }, [user, setLocation]);

  useEffect(() => {
    let active = true;

    const restoreBeforeLogin = async () => {
      try {
        await restoreCloud();
        await refreshSettings();
        if (active) toast.success('Data Cloud berhasil dipulihkan.');
      } catch (error) {
        console.warn('[Login] Cloud restore failed:', error);
        if (active) {
          setRestoreFailed(true);
          toast.warning('Cloud tidak tersedia. Data lokal tetap digunakan.');
        }
      } finally {
        if (active) setRestoring(false);
      }
    };

    void restoreBeforeLogin();
    return () => { active = false; };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (restoring) return;
    setLoading(true);
    try {
      const db = await getDB();
      const users = await db.getAll('users');
      const hashed = hashPassword(password);
      const found = users.find(u => u.username === username && u.passwordHash === hashed);
      if (found) {
        if (!found.aktif) {
          toast.error('Akun anda nonaktif. Hubungi Administrator.');
          await writeLog({
            modul: 'Login', aktivitas: 'Login Gagal',
            detail: `Akun nonaktif: ${username}`, status: 'Warning',
            overrideUser: { id: found.id!, username: found.username, namaUser: found.namaLengkap, role: found.role },
          });
          setLoading(false);
          return;
        }
        const userData = { id: found.id!, username: found.username, namaLengkap: found.namaLengkap, role: found.role };
        login(userData);
        await writeLog({
          modul: 'Login', aktivitas: 'Login Berhasil',
          detail: `Login berhasil sebagai ${found.role}`, status: 'Success',
          overrideUser: { id: found.id!, username: found.username, namaUser: found.namaLengkap, role: found.role },
        });
        toast.success(`Selamat datang, ${found.namaLengkap}`);
        setLocation('/');
      } else {
        toast.error('Username atau password salah.');
        await writeLog({
          modul: 'Login', aktivitas: 'Login Gagal',
          detail: `Username tidak ditemukan atau password salah: ${username}`, status: 'Failed',
        });
      }
    } catch (e: any) {
      toast.error('Terjadi kesalahan saat login.');
      await writeLog({
        modul: 'Login', aktivitas: 'Login Gagal',
        detail: `Error saat login: ${username}`, status: 'Failed',
        errorMessage: e?.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#0f2a4a] via-[#1a4a7a] to-[#0e6bbf] p-4 relative overflow-hidden">

      {/* Background decorative circles */}
      <div className="absolute top-[-80px] right-[-80px] w-72 h-72 rounded-full bg-white/5 pointer-events-none" />
      <div className="absolute bottom-[-60px] left-[-60px] w-56 h-56 rounded-full bg-white/5 pointer-events-none" />
      <div className="absolute top-1/2 left-[-40px] w-32 h-32 rounded-full bg-white/5 pointer-events-none" />

      {/* Main card */}
      <div className="w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl flex min-h-[420px] relative z-10">

        {/* ── Left panel — branding ── */}
        <div className="hidden sm:flex flex-col items-center justify-center w-5/12 bg-gradient-to-b from-[#1565c0] to-[#0d47a1] p-10 text-white text-center gap-6 relative overflow-hidden">
          {/* subtle pattern */}
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '28px 28px' }}
          />

          {/* Logo */}
          <div className="relative z-10 w-24 h-24 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-lg ring-1 ring-white/20 shrink-0">
            {rsLogo ? (
              <img src={rsLogo} alt="Logo" className="w-16 h-16 object-contain" />
            ) : (
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-14 h-14">
                <rect x="6" y="24" width="52" height="16" rx="4" fill="white" fillOpacity="0.9"/>
                <rect x="24" y="6" width="16" height="52" rx="4" fill="white" fillOpacity="0.9"/>
              </svg>
            )}
          </div>

          {/* Title */}
          <div className="relative z-10 space-y-2">
            <h1 className="text-2xl font-bold tracking-wide leading-tight">
              IP Admission<br />Workspace
            </h1>
            <p className="text-sm text-white/75 italic font-light">Empowering Admission Teams</p>
          </div>

          {/* Divider */}
          <div className="relative z-10 w-12 h-px bg-white/30" />

          {/* Feature pills */}
          <div className="relative z-10 flex flex-col gap-2 w-full">
            {['Data Pasien Realtime', 'Integrasi TrakCare', 'Billing & Estimasi'].map(f => (
              <div key={f} className="flex items-center gap-2 text-xs text-white/80 bg-white/10 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-white/60 shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>

        {/* ── Right panel — Login form ── */}
        <div className="flex-1 bg-white flex flex-col justify-center px-8 py-10 gap-6">

          {/* Mobile logo (shown only on small screens) */}
          <div className="sm:hidden flex flex-col items-center gap-2 mb-2">
            <div className="w-16 h-16 rounded-xl bg-blue-600 flex items-center justify-center shadow">
              {rsLogo ? (
                <img src={rsLogo} alt="Logo" className="w-11 h-11 object-contain" />
              ) : (
                <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-10 h-10">
                  <rect x="6" y="24" width="52" height="16" rx="4" fill="white" fillOpacity="0.9"/>
                  <rect x="24" y="6" width="16" height="52" rx="4" fill="white" fillOpacity="0.9"/>
                </svg>
              )}
            </div>
            <p className="text-base font-bold text-gray-800 text-center">IP Admission Workspace</p>
          </div>

          {/* Heading */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Selamat Datang</h2>
            <p className="text-sm text-gray-500 mt-1">Masuk untuk melanjutkan ke sistem</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Username</label>
              <Input
                autoFocus
                placeholder="Masukkan username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                className="h-11 rounded-xl border-gray-200 bg-gray-50 focus-visible:ring-blue-500 focus-visible:border-blue-500 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Masukkan password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="h-11 rounded-xl border-gray-200 bg-gray-50 focus-visible:ring-blue-500 focus-visible:border-blue-500 text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all mt-1"
              disabled={loading || restoring}
            >
              {restoring ? 'Memulihkan Cloud...' : loading ? 'Memverifikasi...' : 'Masuk'}
            </Button>
          </form>

          {/* Cloud status */}
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            {restoring ? (
              <>
                <CloudDownload className="w-3.5 h-3.5 animate-pulse text-blue-400" />
                <span>Memulihkan data dari Cloud...</span>
              </>
            ) : restoreFailed ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>Cloud tidak tersedia — data lokal digunakan</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Data Cloud siap digunakan</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 relative z-10">
        <a
          href="https://wa.me/6281902616888"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/50 hover:text-white/80 text-xs transition-colors flex items-center gap-1.5"
        >
          Developed by Dedi Supriadi
        </a>
      </div>
    </div>
  );
}
