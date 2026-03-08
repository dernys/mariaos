import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Zap, Mail, Lock, User, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type AuthView = "login" | "register" | "forgot";

const Auth = () => {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    else toast.success("¡Bienvenido!");
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Try superadmin registration first (auto-confirms email)
    try {
      const { data, error: fnError } = await supabase.functions.invoke("register-superadmin", {
        body: { email, password, full_name: fullName },
      });

      if (!fnError && data?.success) {
        toast.success("¡Cuenta de superadmin creada! Puedes iniciar sesión.");
        setView("login");
        setLoading(false);
        return;
      }
    } catch {
      // Not superadmin, continue with normal registration
    }

    // Normal registration
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) toast.error(error.message);
    else toast.success("Cuenta creada. Revisa tu correo para confirmar.");
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Correo de recuperación enviado.");
    setLoading(false);
  };

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
          <h1 className="font-heading text-xl font-bold tracking-tight">VentaPro</h1>
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
      </motion.div>
    </div>
  );
};

export default Auth;
