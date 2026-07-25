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
import { ShieldAlert, Eye, EyeOff, CloudDownload } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const { login, user } = useAuth();
  const { rsName, rsLogo, refreshSettings } = useAppContext();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user) setLocation('/');
  }, [user, setLocation]);

  useEffect(() => {
    let active = true;

    const restoreBeforeLogin = async () => {
      try {
        await restoreCloud();
        // Cloud restore can replace application settings such as the hospital
        // name and logo, so refresh the login branding afterward.
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
    return () => {
      active = false;
    };
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
    <div className="min-h-screen flex items-center justify-center bg-[hsl(186,73%,43%)] p-4">
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl flex min-h-[380px]">

        {/* ── Left panel — EMC branding ── */}
        <div className="hidden sm:flex flex-col items-center justify-center w-5/12 bg-gradient-to-b from-[hsl(186,73%,50%)] to-[hsl(186,73%,37%)] p-10 text-white text-center gap-5">
          <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            {rsLogo ? (
              <img src={rsLogo} alt="Logo" className="w-16 h-16 object-contain" />
            ) : (
              /* EMC Healthcare SVG logo mark */
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-14 h-14">
                <rect x="6" y="24" width="52" height="16" rx="4" fill="white" fillOpacity="0.9"/>
                <rect x="24" y="6" width="16" height="52" rx="4" fill="white" fillOpacity="0.9"/>
              </svg>
            )}
          </div>

          <div>
            <div className="text-2xl font-bold tracking-wide leading-tight">
              EMC Healthcare
            </div>
            <div className="text-sm text-white/80 mt-1 italic">We Care with Passion</div>
          </div>

          <div className="text-xs text-white/70 leading-relaxed max-w-[160px]">
            {rsName || 'IP Admission Workspace'}
          </div>
        </div>

        {/* ── Right panel — Login form ── */}
        <div className="flex-1 bg-white flex flex-col justify-center px-8 py-10 gap-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Log In</h1>
            <p className="text-sm text-gray-500 mt-1">Masukkan kredensial Anda untuk melanjutkan</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Username</label>
              <Input
                autoFocus
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                className="h-11 border-0 border-b-2 border-gray-200 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-primary px-0 text-base"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="h-11 border-0 border-b-2 border-gray-200 rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-primary px-0 pr-10 text-base"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-3 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold rounded-full mt-2"
              disabled={loading || restoring}
            >
              {restoring ? 'Memulihkan Cloud...' : loading ? 'Memverifikasi...' : 'Submit'}
            </Button>
          </form>

          <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mt-2">
            {restoring ? (
              <>
                <CloudDownload className="w-3.5 h-3.5 animate-pulse" />
                Memulihkan data dari Cloud...
              </>
            ) : restoreFailed ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                Cloud tidak tersedia — menggunakan data lokal
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                Data Cloud siap digunakan
              </>
            )}
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="absolute bottom-4 text-white/60 text-xs">
        Copyright © by EMC Healthcare
      </div>
    </div>
  );
}
