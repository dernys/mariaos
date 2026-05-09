import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { Zap, Mail, Lock, User, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { InstallPWAPrompt } from "@/components/InstallPWAPrompt";

type AuthView = "login" | "register" | "forgot";

const translateAuthError = (msg: string): string => {
  const m = msg.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) return "Correo o contraseña incorrectos";
  if (m.includes("email not confirmed")) return "Debes confirmar tu correo antes de ingresar";
  if (m.includes("user already registered") || m.includes("already been registered")) return "Este correo ya está registrado";
  if (m.includes("password should be at least")) return "La contraseña debe tener al menos 6 caracteres";
  if (m.includes("pwned") || m.includes("compromised") || m.includes("hibp")) return "Esta contraseña apareció en filtraciones de seguridad. Elige otra.";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Espera unos minutos.";
  if (m.includes("network") || m.includes("fetch")) return "Error de conexión. Verifica tu internet.";
  return msg;
};

const passwordStrength = (pwd: string): { score: number; label: string; color: string } => {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const labels = ["Muy débil", "Débil", "Aceptable", "Buena", "Fuerte", "Excelente"];
  const colors = ["bg-destructive", "bg-destructive", "bg-warning", "bg-warning", "bg-success", "bg-success"];
  return { score, label: labels[score], color: colors[score] };
};

const Auth = () => {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Redirect when already authenticated
  useEffect(() => {
    if (authLoading || !session) return;

    const checkAndRedirect = async () => {
      try {
        // Use cache for instant redirect
        const cached = sessionStorage.getItem(`sa:${session.user.id}`);
        if (cached === "1") return navigate("/superadmin", { replace: true });
        if (cached === "0") return navigate("/app", { replace: true });

        const { data } = await supabase.functions.invoke("check-superadmin");
        const isSA = !!data?.is_superadmin;
        sessionStorage.setItem(`sa:${session.user.id}`, isSA ? "1" : "0");
        navigate(isSA ? "/superadmin" : "/app", { replace: true });
      } catch {
        navigate("/app", { replace: true });
      }
    };

    checkAndRedirect();
  }, [session, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      toast.error(translateAuthError(error.message));
      setLoading(false);
    } else {
      toast.success("Bienvenido de vuelta");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordStrength(password).score < 2) {
      return toast.error("Usa una contraseña más segura (mín. 8 caracteres con mayúsculas y números)");
    }
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    // Try superadmin registration first (auto-confirms email)
    try {
      const { data, error: fnError } = await supabase.functions.invoke("register-superadmin", {
        body: { email: cleanEmail, password, full_name: fullName },
      });

      if (!fnError && data?.success) {
        toast.success("¡Cuenta de superadmin creada! Iniciando sesión...");
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (loginError) {
          toast.error(translateAuthError(loginError.message));
          setLoading(false);
        }
        return;
      }
    } catch {
      // Not superadmin, continue
    }

    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    });
    if (error) toast.error(translateAuthError(error.message));
    else toast.success("Cuenta creada. Revisa tu correo para confirmar.");
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(translateAuthError(error.message));
    else toast.success("Correo de recuperación enviado.");
    setLoading(false);
  };

  const pwdStrength = useMemo(() => passwordStrength(password), [password]);

  // Show spinner while checking auth state
  if (authLoading || session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-xl gradient-brand flex items-center justify-center mb-3">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-xl font-bold tracking-tight">GaIA ERP</h1>
          <p className="text-xs text-muted-foreground mt-1">Sistema de Ventas Multitienda</p>
        </div>

        <div className="bg-card rounded-2xl shadow-elevated border p-6">
          {view === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="text-center mb-4">
                <h2 className="font-heading font-semibold text-lg">Iniciar Sesión</h2>
                <p className="text-xs text-muted-foreground mt-1">Ingresa tus credenciales</p>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9"
                    required
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

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setView("forgot")}
                  className="text-xs text-primary hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              <Button
                type="submit"
                className="w-full gradient-brand text-primary-foreground font-heading font-semibold h-10"
                disabled={loading}
              >
                {loading ? "Ingresando..." : "Ingresar"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                ¿No tienes cuenta?{" "}
                <button
                  type="button"
                  onClick={() => setView("register")}
                  className="text-primary font-medium hover:underline"
                >
                  Regístrate
                </button>
              </p>
            </form>
          )}

          {view === "register" && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="text-center mb-4">
                <h2 className="font-heading font-semibold text-lg">Crear Cuenta</h2>
                <p className="text-xs text-muted-foreground mt-1">Completa tus datos</p>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Nombre completo"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Contraseña (mín. 6 caracteres)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < pwdStrength.score ? pwdStrength.color : "bg-muted"}`} />
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">Seguridad: <span className="font-medium">{pwdStrength.label}</span></p>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full gradient-brand text-primary-foreground font-heading font-semibold h-10"
                disabled={loading}
              >
                {loading ? "Creando cuenta..." : "Crear Cuenta"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                ¿Ya tienes cuenta?{" "}
                <button
                  type="button"
                  onClick={() => setView("login")}
                  className="text-primary font-medium hover:underline"
                >
                  Inicia sesión
                </button>
              </p>
            </form>
          )}

          {view === "forgot" && (
            <form onSubmit={handleForgot} className="space-y-4">
              <button
                type="button"
                onClick={() => setView("login")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
              >
                <ArrowLeft className="h-3 w-3" /> Volver
              </button>

              <div className="text-center mb-4">
                <h2 className="font-heading font-semibold text-lg">Recuperar Contraseña</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Te enviaremos un enlace de recuperación
                </p>
              </div>

              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full gradient-brand text-primary-foreground font-heading font-semibold h-10"
                disabled={loading}
              >
                {loading ? "Enviando..." : "Enviar Enlace"}
              </Button>
            </form>
          )}
        </div>

        <div className="mt-4">
          <InstallPWAPrompt />
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
