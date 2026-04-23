import { useState, useEffect } from "react";
import { ArrowRight, LayoutGrid, FileText, Settings, Upload, Bell, ChevronLeft, ChevronRight, LogOut, ShieldCheck } from "lucide-react";
import { SentinelaDashboard } from "./components/Sentinela/SentinelaDashboard";
import { AuthPage } from "./components/AuthPage";
import { AdminPanel } from "./components/AdminPanel";
import { supabase } from "./lib/supabase";
import type { User } from "@supabase/supabase-js";

type View = "landing" | "login" | "signup" | "app" | "admin";

function SentinelaLogo({ size = 28, showText = true }: { size?: number; showText?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <path
          d="M16 2L28.5 8.5V20C28.5 24.5 22.8 28.4 16 30C9.2 28.4 3.5 24.5 3.5 20V8.5L16 2Z"
          stroke="hsl(var(--primary))" strokeWidth="1.5" fill="hsl(var(--primary) / 0.08)"
        />
        <circle cx="16" cy="16" r="4" fill="hsl(var(--primary))" />
        <circle cx="16" cy="16" r="7" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.4" />
      </svg>
      {showText && (
        <span className="font-bold tracking-tight text-foreground" style={{ fontSize: size * 0.75 }}>
          sentinela
        </span>
      )}
    </div>
  );
}

function LandingPage({ onEntrar, onSignup }: { onEntrar: () => void; onSignup?: () => void }) {
  const handleSignup = onSignup ?? onEntrar;
  const features = [
    {
      icon: "⬡",
      title: "Monitoramento no TJSP",
      desc: "Conectado ao maior tribunal estadual do país. Consulte qualquer movimentação nas execuções fiscais via CPOPG em tempo real.",
    },
    {
      icon: "◎",
      title: "Upload em massa de CNPJs",
      desc: "Importe centenas de CNPJs de uma vez. O Sentinela rastreia todos os processos vinculados automaticamente, sem trabalho manual.",
    },
    {
      icon: "◈",
      title: "Alerta de Prescrição Intercorrente",
      desc: "Motor jurídico de 9 etapas que identifica marco inicial, interrupções, parcelamentos e calcula o prazo com precisão.",
    },
  ];

  const steps = [
    { n: "01", title: "Importe seus CNPJs", desc: "Faça upload de uma planilha com todos os CNPJs dos seus clientes." },
    { n: "02", title: "Monitoramento automático", desc: "O Sentinela consulta o TJSP e categoriza cada processo por risco." },
    { n: "03", title: "Aja antes da concorrência", desc: "Receba o relatório pronto com via sugerida e timeline processual." },
  ];

  return (
    <div className="min-h-screen bg-background font-sans">
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .hero-1 { animation: fadeUp 0.7s ease forwards; }
        .hero-2 { animation: fadeUp 0.7s 0.15s ease both; }
        .hero-3 { animation: fadeUp 0.7s 0.3s ease both; }
        .hero-4 { animation: fadeUp 0.7s 0.45s ease both; }
        .feat-card:hover { border-color: hsl(var(--primary) / 0.4) !important; background: hsl(var(--secondary)) !important; }
        .lp-link { color: hsl(var(--muted-foreground)); text-decoration: none; font-size: 14px; font-weight: 500; transition: color 0.15s; }
        .lp-link:hover { color: hsl(var(--foreground)); }
      `}</style>

      {/* NAV */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-8 h-16">
          <SentinelaLogo />
          <div className="hidden md:flex items-center gap-8">
            <a href="#recursos" className="lp-link">Recursos</a>
            <a href="#como-funciona" className="lp-link">Como funciona</a>
            <a href="#precos" className="lp-link">Preços</a>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onEntrar}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Entrar
            </button>
            <button
              onClick={handleSignup}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 shadow-[0_0_16px_hsl(var(--primary)/0.4)]"
            >
              Começar grátis
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden px-8 pb-20 pt-24">
        {/* bg glow */}
        <div className="pointer-events-none absolute left-1/2 top-1/4 h-96 w-[800px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "radial-gradient(circle, hsl(var(--primary)/0.04) 1px, transparent 1px)", backgroundSize: "40px 40px" }}
        />

        <div className="relative mx-auto max-w-5xl text-center">
          <div className="hero-1 mb-8 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-semibold tracking-widest text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" style={{ animation: "float 2s ease-in-out infinite", boxShadow: "0 0 8px hsl(var(--primary))" }} />
            TJSP · Prescrição Intercorrente · Execução Fiscal
          </div>

          <h1 className="hero-2 text-5xl font-extrabold leading-[1.08] tracking-tight text-foreground md:text-6xl lg:text-7xl" style={{ textWrap: "balance" }}>
            Nunca perca uma{" "}
            <span className="relative text-primary">
              prescrição intercorrente
              <svg className="absolute -bottom-1 left-0 w-full" height="4" viewBox="0 0 100 4" preserveAspectRatio="none">
                <path d="M0 3 Q50 0 100 3" stroke="hsl(var(--primary))" strokeWidth="2" fill="none" opacity="0.5" />
              </svg>
            </span>{" "}
            no TJSP.
          </h1>

          <p className="hero-3 mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground" style={{ textWrap: "pretty" }}>
            Monitore execuções fiscais automaticamente, identifique processos prescritos e transforme
            créditos extintos em oportunidades reais para seus clientes.
          </p>

          <div className="hero-4 mt-10 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={handleSignup}
              className="flex items-center gap-2 rounded-lg bg-primary px-7 py-3.5 text-base font-semibold text-white transition-all hover:opacity-90 shadow-[0_0_24px_hsl(var(--primary)/0.5)]"
            >
              Começar grátis
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={handleSignup}
              className="flex items-center gap-2 rounded-lg border border-primary/25 px-7 py-3.5 text-base font-semibold text-primary transition-all hover:bg-primary/10"
            >
              Ver demonstração
            </button>
          </div>
        </div>

        {/* Hero preview card */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="pointer-events-none absolute -top-4 left-1/2 h-24 w-4/5 -translate-x-1/2 rounded-full bg-primary/20 blur-2xl" />
          <div className="overflow-hidden rounded-xl border border-primary/25 bg-card shadow-[0_40px_80px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              {["#EF4444", "#F59E0B", "#22D3A4"].map((c) => (
                <div key={c} className="h-2.5 w-2.5 rounded-full opacity-70" style={{ background: c }} />
              ))}
              <div className="flex-1" />
              <span className="font-mono text-[11px] text-muted-foreground">sentinela.io/dashboard</span>
            </div>
            <div className="grid grid-cols-4 gap-3 border-b border-border p-4">
              {[
                { l: "Prescritos", v: "3", c: "#22D3A4" },
                { l: "Em Risco", v: "3", c: "#F59E0B" },
                { l: "Monitorados", v: "10", c: "hsl(var(--primary))" },
                { l: "Valor em risco", v: "R$ 5,6M", c: "hsl(var(--foreground))" },
              ].map((s) => (
                <div key={s.l} className="rounded-lg border border-border bg-secondary p-3">
                  <div className="mb-1 text-[10px] text-muted-foreground">{s.l}</div>
                  <div className="text-lg font-bold" style={{ color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>
            {[
              { n: "0012345-67.2018.8.26.0100", r: "Transportes Camargo Ltda", v: "R$ 487.200", s: "Prescrito", sc: "#22D3A4" },
              { n: "0054321-89.2019.8.26.0100", r: "Indústria Metálica Fonseca SA", v: "R$ 1.240.000", s: "Em risco", sc: "#F59E0B" },
              { n: "0098765-43.2020.8.26.0114", r: "Agropecuária São João SPE", v: "R$ 89.500", s: "Monitorado", sc: "hsl(var(--primary))" },
              { n: "0001122-33.2017.8.26.0506", r: "Distribuidora Paulistana ME", v: "R$ 2.100.000", s: "Prescrito", sc: "#22D3A4" },
            ].map((p, i) => (
              <div key={p.n} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0" style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                <span className="flex-[2] font-mono text-[11px] text-muted-foreground hidden md:block">{p.n}</span>
                <span className="flex-[2] text-xs text-muted-foreground">{p.r}</span>
                <span className="flex-1 text-xs font-semibold text-foreground">{p.v}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: p.sc + "22", color: p.sc }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.sc }} />
                  {p.s}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="px-8 pb-20">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border border-border" style={{ background: "linear-gradient(90deg, hsl(var(--card)), hsl(var(--card)))" }}>
          <div className="grid grid-cols-3 divide-x divide-border">
            {[
              { v: "2,4M+", l: "processos monitorados no TJSP" },
              { v: "R$ 1,2Bi", l: "em créditos identificados" },
              { v: "4.800+", l: "escritórios ativos" },
            ].map((s) => (
              <div key={s.l} className="p-8 text-center">
                <div className="text-3xl font-extrabold tracking-tight text-primary">{s.v}</div>
                <div className="mt-2 text-sm text-muted-foreground">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="recursos" className="px-8 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <div className="mb-3 text-xs font-semibold tracking-[0.08em] text-primary">RECURSOS</div>
            <h2 className="text-4xl font-extrabold tracking-tight">Tudo que você precisa para<br />monitorar execuções fiscais</h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">Do upload dos CNPJs ao alerta de prescrição — o fluxo completo, automatizado.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="feat-card cursor-default rounded-xl border border-border bg-card p-8 transition-all duration-200">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-2xl text-primary">{f.icon}</div>
                <h3 className="mb-3 text-base font-bold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="como-funciona" className="px-8 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-3 text-xs font-semibold tracking-[0.08em] text-primary">COMO FUNCIONA</div>
          <h2 className="mb-16 text-4xl font-extrabold tracking-tight">Simples como deve ser</h2>
          <div className="relative grid grid-cols-3 gap-10">
            <div className="pointer-events-none absolute left-[17%] right-[17%] top-6 h-px bg-gradient-to-r from-primary/40 via-primary/20 to-primary/40" />
            {steps.map((s) => (
              <div key={s.n} className="text-center">
                <div className="relative z-10 mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-primary/25 bg-card text-base font-bold text-muted-foreground">
                  {s.n}
                </div>
                <h3 className="mb-2 text-base font-bold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="precos" className="px-8 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-3 text-xs font-semibold tracking-[0.08em] text-primary">PLANOS</div>
          <h2 className="mb-4 text-4xl font-extrabold tracking-tight">Preço justo, sem surpresas</h2>
          <p className="mb-14 text-muted-foreground">Todos os planos incluem 14 dias de teste grátis.</p>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { name: "Starter", price: "R$ 297", period: "/mês", cnpjs: "Até 20 CNPJs", featured: false, items: ["Monitoramento TJSP", "Alertas por e-mail", "Dashboard básico", "1 usuário"] },
              { name: "Professional", price: "R$ 697", period: "/mês", cnpjs: "Até 100 CNPJs", featured: true, items: ["Tudo do Starter", "Alertas por WhatsApp", "Relatórios em PDF", "Até 5 usuários", "API de integração"] },
              { name: "Enterprise", price: "Sob consulta", period: "", cnpjs: "CNPJs ilimitados", featured: false, items: ["Tudo do Professional", "SLA dedicado", "Integrações customizadas", "Usuários ilimitados"] },
            ].map((plan) => (
              <div
                key={plan.name}
                className="relative rounded-xl p-8 text-left"
                style={{
                  background: "hsl(var(--card))",
                  border: plan.featured ? "1px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
                  boxShadow: plan.featured ? "0 0 40px hsl(var(--primary)/0.15)" : "none",
                }}
              >
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-4 py-1 text-[11px] font-bold tracking-[0.06em] text-white">
                    MAIS POPULAR
                  </div>
                )}
                <div className="mb-2 text-sm font-semibold text-muted-foreground">{plan.name}</div>
                <div className="mb-1 text-3xl font-extrabold tracking-tight">
                  {plan.price}<span className="text-sm font-normal text-muted-foreground">{plan.period}</span>
                </div>
                <div className="mb-6 text-xs text-muted-foreground">{plan.cnpjs}</div>
                <div className="mb-6 h-px bg-border" />
                <ul className="mb-7 space-y-2.5">
                  {plan.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="text-[10px] text-emerald-400">✓</span> {item}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleSignup}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold transition-all"
                  style={plan.featured
                    ? { background: "hsl(var(--primary))", color: "#fff" }
                    : { background: "transparent", color: "hsl(var(--primary))", border: "1px solid hsl(var(--primary)/0.25)" }
                  }
                >
                  {plan.name === "Enterprise" ? "Falar com vendas" : "Começar grátis"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="px-8 pb-28 pt-20">
        <div
          className="mx-auto max-w-2xl text-center"
          style={{ background: "radial-gradient(ellipse at 50% 0%, hsl(var(--primary)/0.12) 0%, transparent 70%)" }}
        >
          <h2 className="mb-5 text-4xl font-extrabold tracking-tight">
            Pronto para encontrar seus<br />processos prescritos?
          </h2>
          <p className="mb-9 text-muted-foreground">Comece em minutos. Sem cartão de crédito, sem contratos.</p>
          <button
            onClick={handleSignup}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-4 text-base font-semibold text-white transition-all hover:opacity-90 shadow-[0_0_24px_hsl(var(--primary)/0.5)]"
          >
            Criar conta gratuita
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border px-8 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <SentinelaLogo size={22} />
          <div className="text-xs text-muted-foreground">© 2026 Sentinela. Todos os direitos reservados.</div>
          <div className="flex gap-6">
            {["Privacidade", "Termos", "Contato"].map((l) => (
              <a key={l} href="#" className="text-xs text-muted-foreground transition-colors hover:text-foreground">{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

function AppShell({
  children, onLogout, user, isAdmin = false, activeView = "app", onGoAdmin, onGoApp,
}: {
  children: React.ReactNode;
  onLogout: () => void;
  user: User | null;
  isAdmin?: boolean;
  activeView?: "app" | "admin";
  onGoAdmin?: () => void;
  onGoApp?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState("dashboard");

  const userInitial = user?.email?.[0]?.toUpperCase() ?? "U";
  const userName = (user?.user_metadata?.full_name as string) || user?.email?.split("@")[0] || "Usuário";

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutGrid style={{ width: 18, height: 18 }} /> },
    { id: "processos", label: "Processos", icon: <FileText style={{ width: 18, height: 18 }} /> },
    { id: "configuracoes", label: "Configurações", icon: <Settings style={{ width: 18, height: 18 }} /> },
  ];

  const sideW = collapsed ? 68 : 240;
  const headerTitle = activeView === "admin" ? "Painel Admin" : "Dashboard";

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans">
      <style>{`
        .nav-btn { transition: all 0.15s; }
        .nav-btn:hover { background: hsl(var(--primary)/0.08) !important; color: hsl(var(--foreground)) !important; }
        .nav-btn.active { background: hsl(var(--primary)/0.12) !important; color: hsl(var(--primary)) !important; }
        .nav-admin-active { background: hsl(38 92% 50% / 0.18) !important; color: hsl(38 92% 60%) !important; }
      `}</style>

      {/* Sidebar */}
      <aside
        className="flex h-screen flex-shrink-0 flex-col border-r border-border bg-card overflow-hidden transition-[width] duration-200"
        style={{ width: sideW }}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between gap-2 border-b border-border px-4">
          <div className="min-w-0 flex-1 overflow-hidden">
            {collapsed ? <SentinelaLogo size={26} showText={false} /> : <SentinelaLogo size={26} />}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex flex-shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Import button — only on app view */}
        {!collapsed && activeView === "app" && (
          <div className="border-b border-border p-3">
            <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/25 px-3 py-2 text-xs font-semibold text-primary transition-all hover:bg-primary/10">
              <Upload className="h-3.5 w-3.5" />
              Importar CNPJs
            </button>
          </div>
        )}

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-1 p-2 pt-3">
          {/* App nav items — always visible */}
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveNav(item.id); if (activeView === "admin") onGoApp?.(); }}
              className={`nav-btn ${activeView === "app" && activeNav === item.id ? "active" : ""} flex items-center gap-3 overflow-hidden rounded-lg border-none bg-transparent px-2.5 py-2.5 text-sm font-medium text-muted-foreground`}
              style={{ justifyContent: collapsed ? "center" : "flex-start", whiteSpace: "nowrap" }}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && item.label}
            </button>
          ))}

          {/* Admin toggle button */}
          {isAdmin && (
            <>
              <div className="my-2 border-t border-border" />
              <button
                onClick={activeView === "admin" ? onGoApp : onGoAdmin}
                className={`nav-btn flex items-center gap-3 overflow-hidden rounded-lg border px-2.5 py-2.5 text-sm font-medium transition-all ${
                  activeView === "admin"
                    ? "nav-admin-active border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : "border-amber-500/20 bg-amber-500/5 text-amber-400"
                }`}
                style={{ justifyContent: collapsed ? "center" : "flex-start", whiteSpace: "nowrap" }}
              >
                <span className="flex-shrink-0"><ShieldCheck style={{ width: 18, height: 18 }} /></span>
                {!collapsed && (activeView === "admin" ? "← Voltar ao App" : "Painel Admin")}
              </button>
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="flex items-center gap-2.5 border-t border-border p-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-xs font-bold text-primary">
            {userInitial}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-semibold text-foreground">{userName}</span>
                {isAdmin && (
                  <span className="rounded px-1 py-0.5 text-[9px] font-bold" style={{ background: "hsl(38 92% 50% / 0.15)", color: "hsl(38 92% 60%)" }}>
                    ADMIN
                  </span>
                )}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">{user?.email ?? ""}</div>
            </div>
          )}
          {!collapsed && (
            <button onClick={onLogout} className="flex-shrink-0 text-muted-foreground transition-colors hover:text-red-400" title="Sair">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border bg-card px-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {activeView === "admin" && <ShieldCheck size={14} className="text-amber-400" />}
            {headerTitle}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
                <Bell className="h-4 w-4" />
              </div>
              <div className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-card bg-amber-400" />
            </div>
            {!isAdmin && (
              <button className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-90">
                Upgrade
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

const ADMIN_EMAILS = ["matheusximendes.gon@gmail.com"];

function isAdminUser(user: User | null) {
  if (!user) return false;
  if (ADMIN_EMAILS.includes(user.email ?? "")) return true;
  return (user.user_metadata?.is_admin as boolean) === true;
}

export default function App() {
  const [view, setView] = useState<View>("landing");
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        setView(isAdminUser(session.user) ? "admin" : "app");
      }
      setLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        setView(isAdminUser(session.user) ? "admin" : "app");
      } else {
        setUser(null);
        setView("landing");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setView("landing");
  }

  if (loadingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (view === "landing") {
    return (
      <LandingPage
        onEntrar={() => setView("login")}
        onSignup={() => setView("signup")}
      />
    );
  }

  if (view === "login" || view === "signup") {
    return (
      <AuthPage
        mode={view}
        onSuccess={() => {/* onAuthStateChange handles it */}}
        onBack={() => setView("landing")}
      />
    );
  }

  if (view === "admin") {
    return (
      <AppShell
        onLogout={handleLogout}
        user={user}
        isAdmin={true}
        activeView="admin"
        onGoAdmin={() => setView("admin")}
        onGoApp={() => setView("app")}
      >
        <AdminPanel />
      </AppShell>
    );
  }

  return (
    <AppShell
      onLogout={handleLogout}
      user={user}
      isAdmin={isAdminUser(user)}
      activeView="app"
      onGoAdmin={() => setView("admin")}
      onGoApp={() => setView("app")}
    >
      <SentinelaDashboard />
    </AppShell>
  );
}
