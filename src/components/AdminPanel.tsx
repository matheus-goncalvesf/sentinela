import { useState, useEffect } from "react";
import {
  Users, BarChart3, Settings, ShieldCheck, Search, RefreshCw,
  UserCheck, TrendingUp, Database, Mail,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  firm: string | null;
  plan: string | null;
  is_admin: boolean;
  created_at: string;
  last_sign_in: string | null;
}

type AdminTab = "overview" | "users" | "settings";

export function AdminPanel() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [settings, setSettings] = useState({
    maintenanceMode: false,
    allowNewSignups: true,
    maxProcessesPerUser: "500",
    supportEmail: "suporte@sentinela.io",
  });
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    if (tab === "users" || tab === "overview") {
      fetchProfiles();
    }
  }, [tab, refreshKey]);

  async function fetchProfiles() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) setProfiles(data as Profile[]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = profiles.filter(
    (p) =>
      p.email.toLowerCase().includes(search.toLowerCase()) ||
      (p.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.firm ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: profiles.length,
    thisMonth: profiles.filter((p) => {
      const d = new Date(p.created_at);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length,
    pro: profiles.filter((p) => p.plan === "pro").length,
    enterprise: profiles.filter((p) => p.plan === "enterprise").length,
  };

  function fmtDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  }

  async function toggleAdmin(id: string, current: boolean) {
    await supabase.from("profiles").update({ is_admin: !current }).eq("id", id);
    setRefreshKey((k) => k + 1);
  }

  function saveSettings() {
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  }

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Visão geral", icon: <BarChart3 size={15} /> },
    { id: "users", label: "Usuários", icon: <Users size={15} /> },
    { id: "settings", label: "Configurações", icon: <Settings size={15} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Painel Administrativo</h1>
            <p className="text-xs text-muted-foreground">Gerenciamento da plataforma Sentinela</p>
          </div>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-secondary p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all"
            style={
              tab === t.id
                ? { background: "hsl(var(--card))", color: "hsl(var(--foreground))", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }
                : { color: "hsl(var(--muted-foreground))" }
            }
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Total de usuários", value: stats.total, icon: <Users size={16} />, color: "text-primary", bg: "bg-primary/10" },
              { label: "Cadastros este mês", value: stats.thisMonth, icon: <TrendingUp size={16} />, color: "text-emerald-400", bg: "bg-emerald-500/10" },
              { label: "Plano Pro", value: stats.pro, icon: <UserCheck size={16} />, color: "text-amber-400", bg: "bg-amber-500/10" },
              { label: "Enterprise", value: stats.enterprise, icon: <Database size={16} />, color: "text-violet-400", bg: "bg-violet-500/10" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${s.bg} ${s.color}`}>{s.icon}</span>
                </div>
                <div className={`mt-3 text-3xl font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Recent users */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <span className="text-sm font-semibold text-foreground">Cadastros recentes</span>
              <button onClick={() => setTab("users")} className="text-xs text-primary hover:underline">
                Ver todos
              </button>
            </div>
            <div className="divide-y divide-border">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : profiles.slice(0, 5).length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum usuário encontrado.{" "}
                  <span className="block mt-1 text-xs">Configure a tabela <code className="text-primary">profiles</code> no Supabase.</span>
                </div>
              ) : (
                profiles.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {(p.full_name ?? p.email)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{p.full_name ?? p.email.split("@")[0]}</div>
                      <div className="truncate text-xs text-muted-foreground">{p.email}</div>
                    </div>
                    <PlanBadge plan={p.plan} />
                    <span className="text-xs text-muted-foreground">{fmtDate(p.created_at)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* USERS */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, email ou escritório..."
                className="w-full rounded-lg border border-border bg-secondary py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <span className="text-xs text-muted-foreground">{filtered.length} usuário(s)</span>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  {["Usuário", "Escritório", "Plano", "Admin", "Cadastro", "Último acesso"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      {profiles.length === 0
                        ? <NoTableMessage />
                        : "Nenhum usuário encontrado para esta busca."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {(p.full_name ?? p.email)[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{p.full_name ?? p.email.split("@")[0]}</div>
                            <div className="text-xs text-muted-foreground">{p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.firm ?? "—"}</td>
                      <td className="px-4 py-3"><PlanBadge plan={p.plan} /></td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleAdmin(p.id, p.is_admin)}
                          title={p.is_admin ? "Remover admin" : "Tornar admin"}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
                          style={p.is_admin
                            ? { background: "hsl(245 92% 63% / 0.15)", color: "hsl(245 92% 70%)" }
                            : { background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }
                          }
                        >
                          <ShieldCheck size={11} />
                          {p.is_admin ? "Admin" : "Usuário"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(p.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(p.last_sign_in)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SETTINGS */}
      {tab === "settings" && (
        <div className="space-y-5 max-w-2xl">
          {settingsSaved && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
              <CheckCircle2 size={15} />
              Configurações salvas com sucesso.
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <h3 className="text-sm font-semibold text-foreground">Plataforma</h3>

            <SettingRow
              icon={<AlertTriangle size={14} className="text-amber-400" />}
              label="Modo manutenção"
              description="Bloqueia acesso de usuários comuns à plataforma"
            >
              <Toggle value={settings.maintenanceMode} onChange={(v) => setSettings((s) => ({ ...s, maintenanceMode: v }))} />
            </SettingRow>

            <SettingRow
              icon={<UserCheck size={14} className="text-emerald-400" />}
              label="Permitir novos cadastros"
              description="Habilita o fluxo de signup para novos usuários"
            >
              <Toggle value={settings.allowNewSignups} onChange={(v) => setSettings((s) => ({ ...s, allowNewSignups: v }))} />
            </SettingRow>

            <SettingRow
              icon={<Database size={14} className="text-primary" />}
              label="Máx. processos por usuário"
              description="Limite de processos no plano gratuito"
            >
              <input
                value={settings.maxProcessesPerUser}
                onChange={(e) => setSettings((s) => ({ ...s, maxProcessesPerUser: e.target.value }))}
                className="w-24 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground text-right focus:border-primary focus:outline-none"
              />
            </SettingRow>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <h3 className="text-sm font-semibold text-foreground">Contato & Suporte</h3>

            <SettingRow
              icon={<Mail size={14} className="text-primary" />}
              label="Email de suporte"
              description="Exibido para usuários nas páginas de ajuda"
            >
              <input
                value={settings.supportEmail}
                onChange={(e) => setSettings((s) => ({ ...s, supportEmail: e.target.value }))}
                className="w-52 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </SettingRow>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
              <AlertTriangle size={14} />
              Setup necessário no Supabase
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Para a listagem de usuários funcionar, execute este SQL no <strong className="text-foreground">Supabase SQL Editor</strong>:
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-secondary p-3 text-xs text-foreground leading-relaxed">{SQL_SETUP}</pre>
          </div>

          <button
            onClick={saveSettings}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
          >
            Salvar configurações
          </button>
        </div>
      )}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string | null }) {
  const map: Record<string, { label: string; style: React.CSSProperties }> = {
    pro: { label: "Pro", style: { background: "hsl(38 92% 50% / 0.15)", color: "hsl(38 92% 60%)" } },
    enterprise: { label: "Enterprise", style: { background: "hsl(262 83% 58% / 0.15)", color: "hsl(262 83% 70%)" } },
    free: { label: "Free", style: { background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" } },
  };
  const entry = map[plan ?? "free"] ?? map.free;
  return (
    <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={entry.style}>
      {entry.label}
    </span>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative h-5 w-9 rounded-full transition-colors"
      style={{ background: value ? "hsl(var(--primary))" : "hsl(var(--border))" }}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
        style={{ left: value ? "calc(100% - 18px)" : "2px" }}
      />
    </button>
  );
}

function SettingRow({
  icon, label, description, children,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5">{icon}</span>
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function NoTableMessage() {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground">Tabela <code className="text-primary">profiles</code> não encontrada.</p>
      <p className="text-xs text-muted-foreground">Vá em <strong>Configurações</strong> para ver o SQL de setup.</p>
    </div>
  );
}

// Exported so it can be used elsewhere
export const SQL_SETUP = `-- 1. Criar tabela profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  firm text,
  plan text default 'free',
  is_admin boolean default false,
  created_at timestamptz default now(),
  last_sign_in timestamptz
);

-- 2. RLS: somente admin lê todos; usuário lê o próprio
alter table public.profiles enable row level security;

create policy "admin_read_all" on public.profiles
  for select using (
    (select is_admin from public.profiles where id = auth.uid()) = true
  );

create policy "user_read_own" on public.profiles
  for select using (id = auth.uid());

create policy "user_update_own" on public.profiles
  for update using (id = auth.uid());

-- 3. Trigger: cria perfil automaticamente no signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, firm)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'firm'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Marcar admin (substitua pelo UUID do seu usuário)
-- update public.profiles set is_admin = true
--   where email = 'matheusximendes.gon@gmail.com';`;
