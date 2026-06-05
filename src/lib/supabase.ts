import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function criarCliente() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[Supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configurados. App rodará sem autenticação.");
    return null;
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (url, init) =>
        fetch(url, { ...init, signal: AbortSignal.timeout(5000) }),
    },
  });
}

const cliente = criarCliente();

export const supabase = cliente ?? ({
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: () => Promise.resolve({ error: null }),
    signInWithPassword: () => Promise.resolve({ error: new Error("Supabase offline") }),
    signUp: () => Promise.resolve({ error: new Error("Supabase offline") }),
    signInWithOAuth: () => Promise.resolve({ error: new Error("Supabase offline") }),
    updateUser: () => Promise.resolve({ error: new Error("Supabase offline") }),
  },
  from: () => ({ update: () => {}, select: () => {}, insert: () => {}, delete: () => {} }),
  rpc: () => Promise.resolve({ error: new Error("Supabase offline") }),
}) as any;
