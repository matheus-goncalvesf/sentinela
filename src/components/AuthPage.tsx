import { useState } from "react";
import { Eye, EyeOff, Mail, Lock, User, Briefcase, ArrowLeft } from "lucide-react";
import { supabase } from "../lib/supabase";

type AuthMode = "login" | "signup";

interface AuthPageProps {
  mode?: AuthMode;
  onSuccess: () => void;
  onBack: () => void;
}

export function AuthPage({ mode = "login", onSuccess, onBack }: AuthPageProps) {
  const [view, setView] = useState<AuthMode>(mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [firm, setFirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onSuccess();
    } catch (err: any) {
      setError(translateError(err.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, firm },
        },
      });
      if (error) throw error;
      setSignupDone(true);
    } catch (err: any) {
      setError(translateError(err.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(translateError(error.message));
  }

  function translateError(msg: string): string {
    if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
    if (msg.includes("Email not confirmed")) return "Confirme seu e-mail antes de entrar.";
    if (msg.includes("User already registered")) return "Este e-mail já possui uma conta.";
    if (msg.includes("Password should be")) return "A senha deve ter pelo menos 6 caracteres.";
    if (msg.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos.";
    return msg;
  }

  return (
    <div className="min-h-screen flex bg-background font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .auth-input::placeholder { color: hsl(var(--muted-foreground)); }
      `}</style>

      {/* Left panel — branding */}
      <div className="hidden md:flex w-[45%] min-h-screen flex-col justify-between relative overflow-hidden border-r border-border bg-card p-12">
        {/* Decorative bg */}
        <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-primary/8 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "radial-gradient(circle, hsl(var(--primary)/0.03) 1px, transparent 1px)", backgroundSize: "32px 32px" }}
        />

        {/* Logo */}
        <button onClick={onBack} className="relative flex items-center gap-2.5 w-fit hover:opacity-80 transition-opacity">
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
            <path d="M16 2L28.5 8.5V20C28.5 24.5 22.8 28.4 16 30C9.2 28.4 3.5 24.5 3.5 20V8.5L16 2Z"
              stroke="hsl(var(--primary))" strokeWidth="1.5" fill="hsl(var(--primary)/0.08)" />
            <circle cx="16" cy="16" r="4" fill="hsl(var(--primary))" />
            <circle cx="16" cy="16" r="7" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.4" />
          </svg>
          <span className="text-xl font-bold tracking-tight text-foreground">sentinela</span>
        </button>

        {/* Center content */}
        <div className="relative">
          <div className="mb-5 text-xs font-semibold tracking-[0.08em] text-primary">
            TJSP · EXECUÇÃO FISCAL · PRESCRIÇÃO
          </div>
          <h2 className="mb-5 text-3xl font-extrabold leading-tight tracking-tight">
            Monitore. Identifique.<br />
            <span className="text-primary">Prescreva.</span>
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground max-w-sm">
            A plataforma de monitoramento de execuções fiscais mais completa do Brasil.
            Conectada ao TJSP em tempo real.
          </p>

          <div className="mt-12 flex flex-col gap-5">
            {[
              { stat: "2,4M+", label: "processos monitorados" },
              { stat: "R$ 1,2Bi", label: "em créditos identificados" },
              { stat: "99,9%", label: "uptime garantido" },
            ].map((s) => (
              <div key={s.stat} className="flex items-center gap-4">
                <div className="h-8 w-0.5 flex-shrink-0 rounded-full bg-primary" />
                <div>
                  <div className="text-xl font-bold tracking-tight">{s.stat}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-muted-foreground">
          © 2026 Sentinela — Todos os direitos reservados
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">

          {/* Mobile back */}
          <button
            onClick={onBack}
            className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>

          {/* Signup success */}
          {signupDone ? (
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="14" stroke="#34d399" strokeWidth="1.5" />
                  <path d="M10 16l4 4 8-8" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight">Conta criada!</h2>
              <p className="text-sm text-muted-foreground">
                Enviamos um link de confirmação para <strong className="text-foreground">{email}</strong>.
                <br />Verifique sua caixa de entrada para ativar sua conta.
              </p>
              <button
                onClick={() => { setSignupDone(false); setView("login"); }}
                className="mt-2 text-sm font-semibold text-primary hover:underline"
              >
                Ir para o login →
              </button>
            </div>
          ) : view === "login" ? (
            <>
              <div className="mb-9">
                <h1 className="text-3xl font-extrabold tracking-tight">Bem-vindo de volta</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Não tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => { setView("signup"); setError(null); }}
                    className="font-semibold text-primary hover:underline"
                  >
                    Criar conta gratuita
                  </button>
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <AuthInput
                  label="E-mail profissional"
                  placeholder="voce@escritorio.com.br"
                  value={email}
                  onChange={(v) => setEmail(v)}
                  type="email"
                  icon={<Mail className="h-4 w-4" />}
                  required
                />
                <AuthInput
                  label="Senha"
                  placeholder="••••••••"
                  value={password}
                  onChange={(v) => setPassword(v)}
                  type={showPassword ? "text" : "password"}
                  icon={<Lock className="h-4 w-4" />}
                  rightIcon={
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                  required
                />

                <div className="flex justify-end">
                  <button type="button" className="text-sm font-medium text-primary hover:underline">
                    Esqueceu a senha?
                  </button>
                </div>

                {error && <ErrorBanner message={error} />}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-primary py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60 shadow-[0_0_16px_hsl(var(--primary)/0.3)]"
                >
                  {loading ? "Entrando..." : "Entrar na plataforma"}
                </button>
              </form>

              <OAuthDivider />
              <GoogleButton onClick={handleGoogleLogin} label="Entrar com Google" />
            </>
          ) : (
            <>
              <div className="mb-9">
                <h1 className="text-3xl font-extrabold tracking-tight">Criar sua conta</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Já tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => { setView("login"); setError(null); }}
                    className="font-semibold text-primary hover:underline"
                  >
                    Entrar
                  </button>
                </p>
              </div>

              <form onSubmit={handleSignup} className="space-y-3.5">
                <AuthInput
                  label="Nome completo"
                  placeholder="Dr. Rafael Mendes"
                  value={name}
                  onChange={(v) => setName(v)}
                  icon={<User className="h-4 w-4" />}
                />
                <AuthInput
                  label="Escritório / Empresa"
                  placeholder="Mendes & Associados Advocacia"
                  value={firm}
                  onChange={(v) => setFirm(v)}
                  icon={<Briefcase className="h-4 w-4" />}
                />
                <AuthInput
                  label="E-mail profissional"
                  placeholder="voce@escritorio.com.br"
                  value={email}
                  onChange={(v) => setEmail(v)}
                  type="email"
                  icon={<Mail className="h-4 w-4" />}
                  required
                />
                <AuthInput
                  label="Senha"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(v) => setPassword(v)}
                  type={showPassword ? "text" : "password"}
                  icon={<Lock className="h-4 w-4" />}
                  rightIcon={
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                  required
                />

                <div className="rounded-lg border border-primary/20 bg-primary/8 p-3 text-xs text-muted-foreground">
                  14 dias grátis, sem cartão de crédito. Cancele quando quiser.
                </div>

                {error && <ErrorBanner message={error} />}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-primary py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60 shadow-[0_0_16px_hsl(var(--primary)/0.3)]"
                >
                  {loading ? "Criando conta..." : "Criar conta gratuita"}
                </button>

                <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
                  Ao criar uma conta, você concorda com os{" "}
                  <span className="cursor-pointer text-foreground/70 hover:text-foreground">Termos de Uso</span>{" "}
                  e a{" "}
                  <span className="cursor-pointer text-foreground/70 hover:text-foreground">Política de Privacidade</span>.
                </p>
              </form>

              <OAuthDivider />
              <GoogleButton onClick={handleGoogleLogin} label="Cadastrar com Google" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AuthInput({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  icon,
  rightIcon,
  required,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-medium text-muted-foreground">{label}</label>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          required={required}
          className="auth-input w-full rounded-lg border bg-secondary py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none transition-all"
          style={{
            paddingLeft: icon ? "2.5rem" : "0.75rem",
            paddingRight: rightIcon ? "2.5rem" : "0.75rem",
            borderColor: focused ? "hsl(var(--primary))" : "hsl(var(--border))",
            boxShadow: focused ? "0 0 0 3px hsl(var(--primary)/0.1)" : "none",
          }}
        />
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{rightIcon}</span>
        )}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm text-red-400">
      {message}
    </div>
  );
}

function OAuthDivider() {
  return (
    <div className="my-7 flex items-center gap-4">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">ou continue com</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function GoogleButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-card hover:text-foreground"
    >
      <svg width="18" height="18" viewBox="0 0 18 18">
        <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18Z" />
        <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.96-2.7.96a4.78 4.78 0 0 1-4.49-3.27H1.82v2.07A8 8 0 0 0 8.98 17Z" />
        <path fill="#FBBC05" d="M4.49 10.74A4.8 4.8 0 0 1 4.24 9c0-.61.1-1.2.25-1.74V5.19H1.82A8 8 0 0 0 .98 9c0 1.29.31 2.5.84 3.57l2.67-1.83Z" />
        <path fill="#EA4335" d="M8.98 4.24c1.17 0 2.22.4 3.05 1.2l2.28-2.28A8 8 0 0 0 8.98 1 8 8 0 0 0 1.82 5.19L4.49 7.26A4.78 4.78 0 0 1 8.98 4.24Z" />
      </svg>
      {label}
    </button>
  );
}
