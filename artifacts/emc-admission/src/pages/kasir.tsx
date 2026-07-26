import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getDB, Patient, NotifikasiBillingStatus, KasirTemplate } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { ensureDefaultKasirTemplates } from './templatePesanKasir';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Search, Copy, MessageCircle, X, Phone, User2, CreditCard,
  Bell, Check, CheckCheck, BellRing, FileText, Settings, Pencil,
} from 'lucide-react';
import { useLocation } from 'wouter';

// ── Helpers ──────────────────────────────────────────────────────────────────
const getGreeting = () => {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'Pagi';
  if (h >= 12 && h < 15) return 'Siang';
  if (h >= 15 && h < 18) return 'Sore';
  return 'Malam';
};

const toRupiah = (val: string) => {
  const num = parseInt(val.replace(/\D/g, ''), 10);
  if (isNaN(num)) return '';
  return 'Rp ' + num.toLocaleString('id-ID');
};

const parseRupiah = (val: string) => val.replace(/\D/g, '');

const waLink = (hp: string, msg: string) => {
  let num = hp.replace(/\D/g, '');
  if (num.startsWith('0')) num = '62' + num.slice(1);
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
};

const fmtDate = (d: string) => {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
};

const calcHariRawat = (admissionDate: string): number => {
  try {
    return Math.floor((Date.now() - new Date(admissionDate).getTime()) / 86400000);
  } catch { return 0; }
};

// ── Placeholder utilities ─────────────────────────────────────────────────────
const RUPIAH_KEYS = new Set(['billing', 'deposit', 'sisa_deposit', 'kekurangan']);

const AUTO_KEYS = new Set([
  'nama_pasien', 'no_rm', 'episode', 'ruangan', 'kelas', 'dokter',
  'penjamin', 'salam', 'tanggal', 'jam', 'nama_petugas', 'no_hp_penanggung_jawab',
  // billing-tab auto fields
  'hari_rawat', 'estimasi_billing', 'tanggal_masuk',
]);

function getManualPlaceholders(isiTemplate: string): string[] {
  const matches = isiTemplate.match(/\{\{([^}]+)\}\}/g) ?? [];
  const keys = matches.map(m => m.slice(2, -2).trim());
  return [...new Set(keys.filter(k => !AUTO_KEYS.has(k)))];
}

function applyPlaceholders(
  isiTemplate: string,
  patient: Patient,
  currentUser: { namaLengkap: string; username: string },
  manualFields: Record<string, string>,
): string {
  const now = new Date();
  const tanggal = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const ruangan = [patient.ward, patient.roomName, patient.bedCode].filter(Boolean).join(' / ');

  let msg = isiTemplate;
  msg = msg.replace(/\{\{salam\}\}/g, getGreeting());
  msg = msg.replace(/\{\{nama_pasien\}\}/g, patient.namaPasien || '');
  msg = msg.replace(/\{\{no_rm\}\}/g, patient.noRM || '');
  msg = msg.replace(/\{\{episode\}\}/g, patient.episodeNo || '');
  msg = msg.replace(/\{\{ruangan\}\}/g, ruangan || '-');
  msg = msg.replace(/\{\{kelas\}\}/g, patient.roomType || '-');
  msg = msg.replace(/\{\{dokter\}\}/g, patient.dpjp || '-');
  msg = msg.replace(/\{\{penjamin\}\}/g, patient.payor || '-');
  msg = msg.replace(/\{\{no_hp_penanggung_jawab\}\}/g, patient.noHpPJ || '-');
  msg = msg.replace(/\{\{tanggal\}\}/g, tanggal);
  msg = msg.replace(/\{\{jam\}\}/g, jam);
  msg = msg.replace(/\{\{nama_petugas\}\}/g, currentUser.namaLengkap || currentUser.username);

  Object.entries(manualFields).forEach(([key, val]) => {
    const display = RUPIAH_KEYS.has(key) && val
      ? 'Rp ' + parseInt(val.replace(/\D/g, '') || '0', 10).toLocaleString('id-ID')
      : val;
    msg = msg.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), display);
  });

  return msg;
}

function labelForPlaceholder(key: string): string {
  const map: Record<string, string> = {
    billing: 'Billing (Rp)',
    deposit: 'Deposit (Rp)',
    sisa_deposit: 'Sisa Deposit (Rp)',
    kekurangan: 'Kekurangan (Rp)',
    nama_penanggung_jawab: 'Nama Penanggung Jawab',
    daftar_obat: 'Daftar Obat & Estimasi',
    daftar_periksa: 'Daftar Pemeriksaan & Estimasi',
    daftar_obat_periksa: 'Daftar Obat & Pemeriksaan',
  };
  return map[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Billing Sementara message builder ─────────────────────────────────────────
function buildBillingMessage(p: Patient, hariRawat: number, estimasi: number): string {
  return `Yth. Bapak/Ibu Keluarga Pasien,

Kami informasikan perkembangan sementara biaya perawatan pasien berikut:

Nama Pasien : ${p.namaPasien}
No. RM      : ${p.noRM}
Penjamin    : ${p.payor || '-'}
Hari Rawat  : Hari ke-${hariRawat}

Estimasi total billing sementara hingga saat ini adalah sebesar *Rp ${estimasi.toLocaleString('id-ID')}*.

Nominal tersebut masih bersifat sementara dan dapat berubah sesuai dengan tindakan, pemeriksaan, obat, maupun pelayanan yang masih berlangsung selama masa perawatan.

Apabila terdapat pertanyaan mengenai rincian biaya, silakan menghubungi bagian Kasir Rawat Inap.

Terima kasih atas perhatian dan kerja samanya.

Hormat kami,
Kasir Rawat Inap`;
}

// ── Notifikasi Billing Tab ────────────────────────────────────────────────────
function NotifikasiBillingTab() {
  const [patients, setPatients]         = useState<Patient[]>([]);
  const [statusMap, setStatusMap]       = useState<Map<string, NotifikasiBillingStatus>>(new Map());
  const [estimasiInputs, setEstimasiInputs] = useState<Map<string, string>>(new Map());
  const [filterStatus, setFilterStatus] = useState<'semua' | 'belum' | 'sudah'>('semua');
  const [filterHariRawat, setFilterHariRawat] = useState<number | 'semua'>('semua');
  const [filterPenjamin, setFilterPenjamin]   = useState<string>('semua');
  const [searchTerm, setSearchTerm]     = useState('');

  const load = useCallback(async () => {
    const db = await getDB();
    const all = await db.getAll('patients');
    const today = Date.now();
    const filtered = all.filter(p => {
      if (p.status !== 'aktif') return false;
      if (!p.payor || p.payor.toUpperCase().includes('BPJS')) return false;
      if (!p.admissionDate) return false;
      const hari = Math.floor((today - new Date(p.admissionDate).getTime()) / 86400000);
      return hari >= 2 && hari % 2 === 0;
    });
    setPatients(filtered);

    const statuses = await db.getAll('notifikasiBilling');
    const map = new Map<string, NotifikasiBillingStatus>();
    const inputs = new Map<string, string>();
    for (const s of statuses) {
      map.set(s.id, s);
      if (s.estimasiBilling > 0) inputs.set(s.id, String(s.estimasiBilling));
    }
    setStatusMap(map);
    setEstimasiInputs(inputs);
  }, []);

  useEffect(() => { load(); }, [load]);

  const hariRawatValues = useMemo(() => {
    const vals = new Set<number>();
    patients.forEach(p => vals.add(calcHariRawat(p.admissionDate)));
    return Array.from(vals).sort((a, b) => a - b);
  }, [patients]);

  const penjaminValues = useMemo(() => {
    const vals = new Set<string>();
    patients.forEach(p => { if (p.payor) vals.add(p.payor); });
    return Array.from(vals).sort();
  }, [patients]);

  const displayPatients = useMemo(() => {
    return patients.filter(p => {
      const st = statusMap.get(p.episodeNo);
      const hari = calcHariRawat(p.admissionDate);
      if (filterStatus === 'belum' && st?.sudahDikirim) return false;
      if (filterStatus === 'sudah' && !st?.sudahDikirim) return false;
      if (filterHariRawat !== 'semua' && hari !== filterHariRawat) return false;
      if (filterPenjamin !== 'semua' && p.payor !== filterPenjamin) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        if (!p.namaPasien.toLowerCase().includes(q) && !p.noRM.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => calcHariRawat(a.admissionDate) - calcHariRawat(b.admissionDate));
  }, [patients, statusMap, filterStatus, filterHariRawat, filterPenjamin, searchTerm]);

  const saveEstimasi = async (p: Patient, rawDigits: string) => {
    const amount = parseInt(rawDigits.replace(/\D/g, ''), 10) || 0;
    const db = await getDB();
    const existing = statusMap.get(p.episodeNo);
    const updated: NotifikasiBillingStatus = {
      id: p.episodeNo,
      noRM: p.noRM,
      episodeNo: p.episodeNo,
      estimasiBilling: amount,
      sudahDikirim: existing?.sudahDikirim ?? false,
      sentAt: existing?.sentAt,
      updatedAt: Date.now(),
    };
    await db.put('notifikasiBilling', updated);
    setStatusMap(prev => new Map(prev).set(p.episodeNo, updated));
  };

  const tandaiDikirim = async (p: Patient, sudah: boolean) => {
    const db = await getDB();
    const existing = statusMap.get(p.episodeNo);
    const updated: NotifikasiBillingStatus = {
      id: p.episodeNo,
      noRM: p.noRM,
      episodeNo: p.episodeNo,
      estimasiBilling: existing?.estimasiBilling ?? 0,
      sudahDikirim: sudah,
      sentAt: sudah ? Date.now() : undefined,
      updatedAt: Date.now(),
    };
    await db.put('notifikasiBilling', updated);
    setStatusMap(prev => new Map(prev).set(p.episodeNo, updated));
    toast.success(sudah ? 'Ditandai sudah dikirim!' : 'Status dikembalikan ke belum dikirim.');
  };

  const copyBillingMessage = (p: Patient, hariRawat: number, estimasi: number) => {
    const msg = buildBillingMessage(p, hariRawat, estimasi);
    navigator.clipboard.writeText(msg).then(() => toast.success('Pesan disalin ke clipboard!'));
  };

  const openBillingWhatsApp = (p: Patient, hariRawat: number, estimasi: number) => {
    if (!p.noHpPJ) {
      toast.error('No HP Penanggung Jawab belum diisi di data pasien.');
      return;
    }
    const msg = buildBillingMessage(p, hariRawat, estimasi);
    window.open(waLink(p.noHpPJ, msg), '_blank');
  };

  const belumCount = patients.filter(p => !statusMap.get(p.episodeNo)?.sudahDikirim).length;
  const sudahCount = patients.filter(p => statusMap.get(p.episodeNo)?.sudahDikirim === true).length;

  return (
    <div className="space-y-4">
      {/* Summary counts */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="text-2xl font-bold">{patients.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Pasien</p>
        </div>
        <div className="rounded-xl border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 p-4 text-center">
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{belumCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Belum Dikirim</p>
        </div>
        <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{sudahCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Sudah Dikirim</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama atau No RM..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {/* Status filter */}
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {(['semua', 'belum', 'sudah'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    filterStatus === s
                      ? 'bg-background shadow text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s === 'semua' ? 'Semua' : s === 'belum' ? 'Belum Dikirim' : 'Sudah Dikirim'}
                </button>
              ))}
            </div>

            {/* Hari rawat filter */}
            <select
              className="text-xs border border-input bg-background rounded-lg px-3 py-1.5 h-8 focus:outline-none focus:ring-1 focus:ring-ring"
              value={filterHariRawat}
              onChange={e => setFilterHariRawat(e.target.value === 'semua' ? 'semua' : Number(e.target.value))}
            >
              <option value="semua">Semua Hari Rawat</option>
              {hariRawatValues.map(h => (
                <option key={h} value={h}>Hari ke-{h}</option>
              ))}
            </select>

            {/* Penjamin filter */}
            <select
              className="text-xs border border-input bg-background rounded-lg px-3 py-1.5 h-8 focus:outline-none focus:ring-1 focus:ring-ring"
              value={filterPenjamin}
              onChange={e => setFilterPenjamin(e.target.value)}
            >
              <option value="semua">Semua Penjamin</option>
              {penjaminValues.map(pj => (
                <option key={pj} value={pj}>{pj}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Patient cards */}
      {displayPatients.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Tidak ada pasien yang memenuhi kriteria</p>
          <p className="text-xs mt-1 opacity-70">Pasien non-BPJS aktif dengan hari rawat kelipatan 2 (2, 4, 6, 8, ...)</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayPatients.map(p => {
            const hariRawat  = calcHariRawat(p.admissionDate);
            const stored     = statusMap.get(p.episodeNo);
            const sudahDikirim = stored?.sudahDikirim ?? false;
            const rawInput   = estimasiInputs.get(p.episodeNo) ?? (stored?.estimasiBilling ? String(stored.estimasiBilling) : '');
            const estimasiNum = parseInt(rawInput.replace(/\D/g, ''), 10) || 0;

            return (
              <div
                key={p.episodeNo}
                className={`rounded-xl border p-4 space-y-3 transition-all ${
                  sudahDikirim
                    ? 'bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
                    : 'bg-card border-border hover:border-primary/30'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-base leading-tight truncate">{p.namaPasien}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      <span>RM: <span className="font-medium text-foreground">{p.noRM}</span></span>
                      <span>Ep: <span className="font-medium text-foreground">{p.episodeNo}</span></span>
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                    sudahDikirim
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                      : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                  }`}>
                    {sudahDikirim ? '✓ Sudah Dikirim' : 'Belum Dikirim'}
                  </span>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Penjamin</p>
                    <p className="font-semibold truncate">{p.payor || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ruangan/Kamar</p>
                    <p className="font-semibold truncate">{p.ward || p.roomName || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tanggal Masuk</p>
                    <p className="font-semibold">{fmtDate(p.admissionDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Hari Rawat</p>
                    <p className="font-bold text-primary text-base">Hari ke-{hariRawat}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5">No. HP Penanggung Jawab</p>
                    {p.noHpPJ ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" /> {p.noHpPJ}
                        </span>
                        <a
                          href={waLink(p.noHpPJ, buildBillingMessage(p, hariRawat, estimasiNum))}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#25D366]/10 text-[#128C7E] border border-[#25D366]/30 hover:bg-[#25D366]/20 transition-colors"
                        >
                          <MessageCircle className="w-3 h-3" /> WhatsApp
                        </a>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" /> No. HP Penanggung Jawab belum diisi.
                      </p>
                    )}
                  </div>
                </div>

                {/* Estimasi billing input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Estimasi Billing Sementara</label>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground select-none">Rp</span>
                      <Input
                        className="pl-9 font-semibold"
                        inputMode="numeric"
                        placeholder="0"
                        value={rawInput}
                        onChange={e => {
                          const digits = e.target.value.replace(/\D/g, '');
                          setEstimasiInputs(prev => new Map(prev).set(p.episodeNo, digits));
                        }}
                        onBlur={() => saveEstimasi(p, rawInput)}
                      />
                    </div>
                    {estimasiNum > 0 && (
                      <p className="text-sm font-bold text-primary whitespace-nowrap shrink-0">
                        {estimasiNum.toLocaleString('id-ID')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5 text-xs h-8"
                    onClick={() => copyBillingMessage(p, hariRawat, estimasiNum)}
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy Pesan
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5 text-xs h-8 bg-[#25D366] hover:bg-[#20bd5a] text-white border-0"
                    onClick={() => openBillingWhatsApp(p, hariRawat, estimasiNum)}
                    disabled={!p.noHpPJ}
                    title={!p.noHpPJ ? 'No HP PJ belum diisi di data pasien' : `Kirim ke ${p.noHpPJ}`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </Button>
                </div>

                <Button
                  size="sm"
                  variant={sudahDikirim ? 'outline' : 'default'}
                  className={`w-full gap-2 text-xs h-8 ${
                    sudahDikirim
                      ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                      : ''
                  }`}
                  onClick={() => tandaiDikirim(p, !sudahDikirim)}
                >
                  {sudahDikirim ? (
                    <><CheckCheck className="w-3.5 h-3.5" /> Sudah Dikirim — Batalkan</>
                  ) : (
                    <><Check className="w-3.5 h-3.5" /> Tandai Sudah Dikirim</>
                  )}
                </Button>

                {!p.noHpPJ && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                    ⚠️ No HP PJ belum diisi — tombol WhatsApp tidak aktif
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Pesan Kasir Tab — dynamic templates from DB ───────────────────────────────
function PesanKasirTab() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [patients, setPatients]           = useState<Patient[]>([]);
  const [templates, setTemplates]         = useState<KasirTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [searchTerm, setSearchTerm]       = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<KasirTemplate | null>(null);
  const [manualFields, setManualFields]   = useState<Record<string, string>>({});
  const [manualPlaceholders, setManualPlaceholders] = useState<string[]>([]);
  const [message, setMessage]             = useState('');

  // Load patients + templates (seed defaults if empty)
  const loadAll = useCallback(async () => {
    const db = await getDB();
    const [allPatients] = await Promise.all([
      db.getAll('patients'),
      ensureDefaultKasirTemplates(),
    ]);
    setPatients(allPatients.filter(p => p.status === 'aktif'));

    const allTpls = await db.getAll('kasirTemplates');
    setTemplates(allTpls.filter(t => t.aktif).sort((a, b) => a.urutan - b.urutan));
    setLoadingTemplates(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Search patients
  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults([]); return; }
    const q = searchTerm.toLowerCase();
    setSearchResults(
      patients.filter(p =>
        p.noRM.toLowerCase().includes(q) || p.namaPasien.toLowerCase().includes(q)
      ).slice(0, 8)
    );
  }, [searchTerm, patients]);

  // Re-generate message whenever template, patient, or manual fields change
  useEffect(() => {
    if (!selectedTemplate || !selectedPatient || !user) { setMessage(''); return; }
    const generated = applyPlaceholders(selectedTemplate.isiTemplate, selectedPatient, user, manualFields);
    setMessage(generated);
  }, [selectedTemplate, selectedPatient, user, manualFields]);

  const selectPatient = (p: Patient) => {
    setSelectedPatient(p);
    setSearchTerm('');
    setSearchResults([]);
    setSelectedTemplate(null);
    setManualFields({});
    setManualPlaceholders([]);
    setMessage('');
  };

  const clearPatient = () => {
    setSelectedPatient(null);
    setSelectedTemplate(null);
    setManualFields({});
    setManualPlaceholders([]);
    setMessage('');
  };

  const selectTemplate = (tpl: KasirTemplate) => {
    setSelectedTemplate(tpl);
    setManualFields({});
    setManualPlaceholders(getManualPlaceholders(tpl.isiTemplate));
  };

  const setField = (key: string, val: string) =>
    setManualFields(f => ({ ...f, [key]: val }));

  const handleRupiahInput = (key: string, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setField(key, digits);
  };

  const copyMessage = () => {
    if (!message) return;
    navigator.clipboard.writeText(message).then(() => toast.success('Pesan disalin ke clipboard!'));
  };

  const openWhatsApp = () => {
    if (!message) return;
    const hp = selectedPatient?.noHpPJ || '';
    if (!hp) { toast.error('No HP Penanggung Jawab belum diisi di data pasien.'); return; }
    window.open(waLink(hp, message), '_blank');
  };

  // Group templates by category
  const grouped = useMemo(() => {
    const map = new Map<string, KasirTemplate[]>();
    for (const t of templates) {
      const cat = t.kategori || 'Lainnya';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }
    return map;
  }, [templates]);

  return (
    <div className="space-y-6">
      {/* ── Patient selector ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User2 className="w-4 h-4" /> Pilih Pasien
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedPatient ? (
            <div className="flex items-start justify-between gap-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 rounded-lg p-4">
              <div className="space-y-1 min-w-0">
                <p className="font-bold text-emerald-800 dark:text-emerald-300 text-base">{selectedPatient.namaPasien}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><User2 className="w-3 h-3" /> {selectedPatient.noRM}</span>
                  <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> {selectedPatient.payor || '-'}</span>
                  {selectedPatient.noHpPJ ? (
                    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                      <Phone className="w-3 h-3" /> {selectedPatient.noHpPJ}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600 font-medium">
                      <Phone className="w-3 h-3" /> No HP PJ belum diisi
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[selectedPatient.ward, selectedPatient.roomName, selectedPatient.bedCode].filter(Boolean).join(' / ')}
                  {selectedPatient.dpjp ? ` · Dr. ${selectedPatient.dpjp}` : ''}
                </p>
              </div>
              <button onClick={clearPatient} className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari No RM atau nama pasien aktif..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10"
                autoComplete="off"
              />
              {searchResults.length > 0 && (
                <div className="absolute z-50 w-full bg-popover border border-border rounded-lg shadow-lg mt-1 max-h-56 overflow-y-auto">
                  {searchResults.map(p => (
                    <button
                      key={p.noRM}
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b border-border/50 last:border-0"
                      onClick={() => selectPatient(p)}
                    >
                      <p className="font-semibold text-sm">{p.namaPasien}</p>
                      <p className="text-xs text-muted-foreground">{p.noRM} · {p.ward || p.roomName} · {p.payor}</p>
                    </button>
                  ))}
                </div>
              )}
              {searchTerm.length > 1 && searchResults.length === 0 && (
                <div className="absolute z-50 w-full bg-popover border border-border rounded-lg shadow-lg mt-1 p-4 text-center text-sm text-muted-foreground">
                  Pasien tidak ditemukan
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Template picker ── */}
      {selectedPatient && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="w-4 h-4" /> Pilih Template Pesan
              </CardTitle>
              <button
                onClick={() => setLocation('/settings')}
                className="text-xs flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                title="Kelola Template"
              >
                <Settings className="w-3.5 h-3.5" /> Kelola Template
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingTemplates ? (
              <p className="text-sm text-muted-foreground">Memuat template...</p>
            ) : templates.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <FileText className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Belum ada template aktif.</p>
                <button
                  onClick={() => setLocation('/settings')}
                  className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
                >
                  <Settings className="w-3.5 h-3.5" /> Tambahkan template di Pengaturan
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {Array.from(grouped.entries()).map(([cat, tpls]) => (
                  <div key={cat}>
                    {grouped.size > 1 && (
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{cat}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {tpls.map(t => (
                        <button
                          key={t.id}
                          onClick={() => selectTemplate(t)}
                          className={`text-left px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                            selectedTemplate?.id === t.id
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:border-primary/40 hover:bg-muted/50'
                          }`}
                        >
                          {t.namaTemplate}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Manual fields + preview ── */}
      {selectedTemplate && selectedPatient && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Manual input fields */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Pencil className="w-4 h-4" /> Lengkapi Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {manualPlaceholders.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Semua placeholder terisi otomatis dari data pasien.
                </p>
              ) : (
                manualPlaceholders.map(key => (
                  <div key={key} className="space-y-1.5">
                    <label className="text-sm font-semibold">{labelForPlaceholder(key)}</label>
                    {RUPIAH_KEYS.has(key) ? (
                      <div className="space-y-1">
                        <Input
                          placeholder="Contoh: 5000000"
                          value={manualFields[key] || ''}
                          onChange={e => handleRupiahInput(key, e.target.value)}
                          inputMode="numeric"
                        />
                        {manualFields[key] && (
                          <p className="text-xs text-muted-foreground pl-1">
                            {toRupiah(manualFields[key])}
                          </p>
                        )}
                      </div>
                    ) : (
                      <textarea
                        className="w-full min-h-[90px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                        placeholder={`Isi ${labelForPlaceholder(key)}...`}
                        value={manualFields[key] || ''}
                        onChange={e => setField(key, e.target.value)}
                      />
                    )}
                  </div>
                ))
              )}

              {/* Remaining unfilled placeholders indicator */}
              {manualPlaceholders.some(k => !manualFields[k]) && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ {manualPlaceholders.filter(k => !manualFields[k]).length} field belum diisi — placeholder akan tampil as-is di preview.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Preview + actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Preview &amp; Edit Pesan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                className="w-full min-h-[220px] rounded-lg border bg-muted/30 px-4 py-3 text-sm font-sans leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Pilih pasien dan template untuk melihat preview pesan..."
              />

              <div className="flex gap-2">
                <Button
                  onClick={copyMessage}
                  disabled={!message}
                  variant="outline"
                  className="flex-1 gap-2"
                >
                  <Copy className="w-4 h-4" /> Salin Pesan
                </Button>
                <Button
                  onClick={openWhatsApp}
                  disabled={!message}
                  className="flex-1 gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white border-0"
                >
                  <MessageCircle className="w-4 h-4" /> Kirim WhatsApp
                </Button>
              </div>

              {!selectedPatient.noHpPJ && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                  ⚠️ Tombol WhatsApp perlu No HP PJ — isi di detail pasien terlebih dahulu.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────
export default function KasirPage() {
  const [activeTab, setActiveTab] = useState<'pesan' | 'notifikasi'>('pesan');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pesan Kasir</h1>
        <p className="text-muted-foreground mt-1">Generate pesan konfirmasi WhatsApp untuk penanggung jawab pasien.</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('pesan')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'pesan'
              ? 'bg-background shadow text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          Pesan Kasir
        </button>
        <button
          onClick={() => setActiveTab('notifikasi')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'notifikasi'
              ? 'bg-background shadow text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <BellRing className="w-4 h-4" />
          Notifikasi Billing Sementara
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'pesan' ? <PesanKasirTab /> : <NotifikasiBillingTab />}
    </div>
  );
}
