import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { ShoppingBag, Mail, Lock, User, Eye, EyeOff, ArrowLeft, ShieldCheck, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { z } from "zod";

type View = "login" | "register" | "forgot";

const schema = z.object({
  fullName: z.string().trim().min(2, "Nombre demasiado corto").max(120),
  email: z.string().trim().email("Correo no válido").max(255),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
});

const strength = (pwd: string) => {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const colors = ["bg-destructive", "bg-destructive", "bg-warning", "bg-warning", "bg-success", "bg-success"];
  return { score, color: colors[score] };
};

const translateError = (msg: string) => {
  const m = msg.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) return "Correo o contraseña incorrectos";
  if (m.includes("email not confirmed")) return "Debes confirmar tu correo antes de entrar. Revisa tu bandeja.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Ese correo ya tiene cuenta. Inicia sesión.";
  if (m.includes("pwned") || m.includes("compromised")) return "Esa contraseña apareció en filtraciones. Usa otra.";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Espera unos minutos.";
  return msg;
};

const MarketplaceAuth = () => {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [view, setView] = useState<View>(params.get("view") === "register" ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const next = useMemo(() => {
    const n = params.get("next");
    if (!n || !n.startsWith("/") || n.startsWith("//")) return "/marketplace";
    return n;
  }, [params]);

  useEffect(() => {
    if (!authLoading && session) navigate(next, { replace: true });
  }, [session, authLoading, navigate, next]);

  const pwd = useMemo(() => strength(password), [password]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) toast.error(translateError(error.message));
    else toast.success("Bienvenido de nuevo");
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ fullName, email, password });
    if (!parsed.success) {
      return toast.error(parsed.error.issues[0].message);
    }
    if (pwd.score < 3) return toast.error("Contraseña débil: combina mayúsculas, números y símbolos");
    setLoading(true);
    const cleanEmail = parsed.data.email.toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.fullName, account_type: "marketplace_customer" },
        emailRedirectTo: `${window.location.origin}/marketplace/acceso`,
      },
    });
    setLoading(false);
    if (error) return toast.error(translateError(error.message));
    if (data.session) {
      toast.success("Cuenta creada");
      return;
    }
    setPendingEmail(cleanEmail);
    toast.success("Te enviamos un correo de verificación");
  };

  const resend = async () => {
    if (!pendingEmail) return;
    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: `${window.location.origin}/marketplace/acceso` },
    });
    setLoading(false);
    if (error) toast.error(translateError(error.message));
    else toast.success("Correo de verificación reenviado");
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(translateError(error.message));
    else toast.success("Te enviamos el enlace de recuperación");
  };

  if (authLoading || session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="h-12 w-12 rounded-xl gradient-brand flex items-center justify-center mb-3">
            <ShoppingBag className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-xl font-bold tracking-tight">Cuenta de comprador</h1>
          <p className="text-xs text-muted-foreground mt-1 text-center">
            Crea tu cuenta para pedir, seguir tus pedidos y valorar productos
          </p>
        </div>

        {pendingEmail ? (
          <div className="bg-card rounded-2xl shadow-elevated border p-6 text-center space-y-3">
            <MailCheck className="h-9 w-9 text-primary mx-auto" />
            <h2 className="font-heading font-semibold">Verifica tu correo</h2>
            <p className="text-xs text-muted-foreground">
              Enviamos un enlace de confirmación a <span className="font-medium text-foreground">{pendingEmail}</span>.
              Tu cuenta se activa al confirmarlo.
            </p>
            <Button variant="outline" className="w-full h-10" onClick={resend} disabled={loading}>
              Reenviar correo
            </Button>
            <button type="button" onClick={() => { setPendingEmail(null); setView("login"); }} className="text-xs text-primary hover:underline">
              Volver a iniciar sesión
            </button>
          </div>
        ) : (
          <div className="bg-card rounded-2xl shadow-elevated border p-6">
            {view === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="text-center mb-2">
                  <h2 className="font-heading font-semibold text-lg">Iniciar sesión</h2>
                </div>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" required />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type={showPwd ? "text" : "password"} placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9 pr-9" required />
                  <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="text-right">
                  <button type="button" onClick={() => setView("forgot")} className="text-xs text-primary hover:underline">
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <Button type="submit" className="w-full gradient-brand text-primary-foreground font-heading font-semibold h-10" disabled={loading}>
                  {loading ? "Entrando…" : "Entrar"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  ¿No tienes cuenta?{" "}
                  <button type="button" onClick={() => setView("register")} className="text-primary font-medium hover:underline">
                    Regístrate
                  </button>
                </p>
              </form>
            )}

            {view === "register" && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="text-center mb-2">
                  <h2 className="font-heading font-semibold text-lg">Crear cuenta</h2>
                  <Badge variant="secondary" className="mt-2 text-[10px] gap-1">
                    <ShieldCheck className="h-3 w-3" /> Verificación por correo
                  </Badge>
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} className="pl-9" required maxLength={120} />
                </div>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" required maxLength={255} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type={showPwd ? "text" : "password"} placeholder="Contraseña (mín. 8)" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9 pr-9" required minLength={8} />
                  <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < pwd.score ? pwd.color : "bg-muted"}`} />
                    ))}
                  </div>
                )}
                <Button type="submit" className="w-full gradient-brand text-primary-foreground font-heading font-semibold h-10" disabled={loading}>
                  {loading ? "Creando…" : "Crear mi cuenta"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  ¿Ya tienes cuenta?{" "}
                  <button type="button" onClick={() => setView("login")} className="text-primary font-medium hover:underline">
                    Inicia sesión
                  </button>
                </p>
              </form>
            )}

            {view === "forgot" && (
              <form onSubmit={handleForgot} className="space-y-4">
                <button type="button" onClick={() => setView("login")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-3 w-3" /> Volver
                </button>
                <h2 className="font-heading font-semibold text-lg text-center">Recuperar acceso</h2>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" required />
                </div>
                <Button type="submit" className="w-full gradient-brand text-primary-foreground font-heading font-semibold h-10" disabled={loading}>
                  {loading ? "Enviando…" : "Enviar enlace"}
                </Button>
              </form>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground text-center mt-4">
          El registro público es solo para compradores del marketplace. Los accesos de negocios y su personal
          los crea el administrador de cada empresa.{" "}
          <Link to="/auth" className="text-primary hover:underline">Acceso de empresas</Link>
        </p>
      </motion.div>
    </div>
  );
};

export default MarketplaceAuth;
