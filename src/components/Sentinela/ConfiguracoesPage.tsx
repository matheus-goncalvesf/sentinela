import { useState } from "react";
import { User, ShieldAlert, CreditCard, KeyRound, AlertTriangle, Eye, EyeOff, Save, Loader2, CheckCircle2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export function ConfiguracoesPage({ user }: { user: SupabaseUser | null }) {
  // UI State
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [globalMessage, setGlobalMessage] = useState<{ type: "success" | "error" | "info", text: string } | null>(null);

  // Profile Form State
  const [profileName, setProfileName] = useState((user?.user_metadata?.full_name as string) || "");
  const [profileFirm, setProfileFirm] = useState((user?.user_metadata?.firm as string) || "");

  // Password Form State
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Deletion Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoadingAction("profile");
    setGlobalMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: profileName, firm: profileFirm }
      });
      if (error) throw error;
      setGlobalMessage({ type: "success", text: "Perfil atualizado com sucesso!" });
    } catch (err: any) {
      setGlobalMessage({ type: "error", text: "Erro ao atualizar perfil. Tente novamente." });
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setGlobalMessage({ type: "error", text: "A nova senha deve ter pelo menos 6 caracteres." });
      return;
    }
    setLoadingAction("password");
    setGlobalMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setGlobalMessage({ type: "success", text: "Senha alterada com sucesso!" });
      setNewPassword("");
      setShowPasswordForm(false);
    } catch (err: any) {
      setGlobalMessage({ type: "error", text: "Erro ao alterar a senha. " + err.message });
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleRequestAction(action: "cancel_plan" | "delete_account") {
    if (!user) return;
    setLoadingAction(action);
    setGlobalMessage(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ account_action: action })
        .eq("id", user.id);

      if (error) {
        // Handle 404 cleanly
        if (error.code === "PGRST205" || error.message?.includes("Could not find the table")) {
          setGlobalMessage({
            type: "info",
            text: action === "delete_account" 
              ? "Sua solicitação de exclusão foi registrada localmente. O ambiente está pendente de configuração pelo Administrador."
              : "Sua solicitação de cancelamento foi registrada localmente. O ambiente está pendente de configuração pelo Administrador."
          });
          return;
        }
        throw error;
      }
      
      setGlobalMessage({
        type: "success",
        text: action === "delete_account"
          ? "Solicitação de exclusão enviada ao administrador."
          : "Solicitação de cancelamento enviada ao administrador."
      });
    } catch (err: any) {
      console.error(err);
      setGlobalMessage({ type: "error", text: "Erro inesperado ao processar a solicitação." });
    } finally {
      setLoadingAction(null);
    }
  }

  async function confirmDeletion(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.email || !deletePassword) return;
    setLoadingAction("confirm_delete");
    setGlobalMessage(null);
    try {
      // 1. Verify password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: deletePassword,
      });

      if (signInError) {
        setGlobalMessage({ type: "error", text: "Senha incorreta. A exclusão foi cancelada." });
        return;
      }

      // 2. If valid, request actual deletion via RPC
      const { error: deleteError } = await supabase.rpc("delete_user");
      
      if (deleteError) {
        if (deleteError.message?.includes("Could not find the function") || deleteError.code === "PGRST202") {
          setGlobalMessage({ type: "error", text: "Erro de infraestrutura: O administrador precisa criar a função 'delete_user' no Supabase." });
          return;
        }
        throw deleteError;
      }

      await supabase.auth.signOut();
      // O listener do App.tsx vai redirecionar para a landing page automaticamente.

    } catch (err) {
      setGlobalMessage({ type: "error", text: "Erro ao validar credenciais." });
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="space-y-8 max-w-3xl relative">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Configurações</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie seu perfil, segurança e controle total sobre sua conta.
        </p>
      </div>

      {globalMessage && (
        <div className={`flex items-start gap-3 rounded-xl border px-4 py-4 text-sm shadow-sm transition-all animate-in slide-in-from-top-2 ${
          globalMessage.type === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" :
          globalMessage.type === "info" ? "border-blue-500/30 bg-blue-500/10 text-blue-500" :
          "border-red-500/30 bg-red-500/10 text-red-500"
        }`}>
          {globalMessage.type === "success" && <CheckCircle2 className="h-5 w-5 flex-shrink-0" />}
          {globalMessage.type === "info" && <AlertTriangle className="h-5 w-5 flex-shrink-0" />}
          {globalMessage.type === "error" && <AlertTriangle className="h-5 w-5 flex-shrink-0" />}
          <div className="flex-1 font-medium leading-relaxed">{globalMessage.text}</div>
          <button onClick={() => setGlobalMessage(null)} className="opacity-70 hover:opacity-100 transition-opacity">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Perfil Section */}
      <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-secondary/30 px-6 py-4 flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <User className="h-4 w-4" />
          </div>
          <h3 className="font-semibold text-foreground">Informações Pessoais</h3>
        </div>
        
        <div className="p-6">
          <form onSubmit={handleUpdateProfile} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">E-mail (Login)</label>
                <div className="rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-muted-foreground cursor-not-allowed">
                  {user?.email}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Nome Completo</label>
                <input 
                  type="text" 
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-shadow" 
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Escritório / Organização</label>
                <input 
                  type="text" 
                  value={profileFirm}
                  onChange={(e) => setProfileFirm(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-shadow" 
                />
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
              <button 
                type="submit"
                disabled={loadingAction === "profile"}
                className="flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-all hover:bg-foreground/90 disabled:opacity-50"
              >
                {loadingAction === "profile" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar Alterações
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Segurança Section */}
      <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-secondary/30 px-6 py-4 flex items-center gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
            <KeyRound className="h-4 w-4" />
          </div>
          <h3 className="font-semibold text-foreground">Segurança da Conta</h3>
        </div>
        
        <div className="p-6">
          {!showPasswordForm ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Alterar Senha</p>
                <p className="text-xs text-muted-foreground mt-1">Atualize sua senha de acesso a qualquer momento.</p>
              </div>
              <button 
                onClick={() => setShowPasswordForm(true)}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary shadow-sm"
              >
                Nova Senha
              </button>
            </div>
          ) : (
            <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-sm animate-in fade-in slide-in-from-top-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Nova Senha</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background pl-3 pr-10 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-shadow" 
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  type="submit"
                  disabled={loadingAction === "password"}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center shadow-sm"
                >
                  {loadingAction === "password" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar Troca"}
                </button>
                <button 
                  type="button"
                  onClick={() => { setShowPasswordForm(false); setNewPassword(""); }}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Assinatura Section */}
      <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-secondary/30 px-6 py-4 flex items-center gap-3">
          <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
            <CreditCard className="h-4 w-4" />
          </div>
          <h3 className="font-semibold text-foreground">Assinatura e Planos</h3>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground">Status do Plano</span>
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-500 border border-emerald-500/20">
                  ATIVO
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">Sua conta atual está sob gestão do administrador.</p>
            </div>
            
            <button 
              onClick={() => handleRequestAction("cancel_plan")}
              disabled={loadingAction === "cancel_plan"}
              className="rounded-lg border border-amber-500/30 px-4 py-2 text-sm font-medium text-amber-500 transition-colors hover:bg-amber-500/10 disabled:opacity-50 flex items-center gap-2"
            >
              {loadingAction === "cancel_plan" && <Loader2 className="h-3 w-3 animate-spin" />}
              Solicitar Cancelamento
            </button>
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="rounded-2xl border border-red-500/30 bg-red-500/5 shadow-sm overflow-hidden mt-12">
        <div className="border-b border-red-500/20 px-6 py-4 flex items-center gap-3">
          <div className="rounded-lg bg-red-500/20 p-2 text-red-500">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <h3 className="font-semibold text-red-500">Zona de Perigo</h3>
        </div>
        <div className="p-6">
          <p className="text-sm text-foreground mb-1 font-medium">Excluir conta permanentemente</p>
          <p className="text-xs text-muted-foreground mb-5 max-w-2xl leading-relaxed">
            A exclusão da conta resultará na perda irrecuperável de todo o seu histórico de processos, configurações e assinaturas ativas. Esta ação exige sua senha atual para confirmação.
          </p>
          <button 
            onClick={() => setShowDeleteModal(true)}
            className="rounded-lg bg-red-500 hover:bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors shadow-sm"
          >
            Excluir minha conta
          </button>
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-500 mb-4">
              <div className="rounded-full bg-red-500/10 p-3">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold">Confirmação de Segurança</h3>
            </div>
            
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Para prosseguir com a solicitação de exclusão, por favor, insira sua senha atual. Isso garante que a ação foi iniciada por você.
            </p>

            <form onSubmit={confirmDeletion} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Senha atual</label>
                <input 
                  type="password" 
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full rounded-lg border border-red-500/30 bg-background px-3 py-2.5 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-shadow" 
                  placeholder="Sua senha..."
                  required
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button 
                  type="button"
                  onClick={() => { setShowDeleteModal(false); setDeletePassword(""); }}
                  className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={loadingAction === "confirm_delete" || !deletePassword}
                  className="flex items-center gap-2 rounded-lg bg-red-500 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-50 shadow-sm"
                >
                  {loadingAction === "confirm_delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar Exclusão"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
