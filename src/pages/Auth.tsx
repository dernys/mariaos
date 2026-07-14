import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { Zap, Mail, Lock, User, Eye, EyeOff, ArrowLeft, PlayCircle, Store, UtensilsCrossed, Building2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { InstallPWAPrompt } from "@/components/InstallPWAPrompt";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

type AuthView = "login" | "register" | "forgot";

const translateAuthError = (msg: string, t: (k: string) => string): string => {
  const m = msg.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) return t("auth.errors.invalidCredentials");
  if (m.includes("email not confirmed")) return t("auth.errors.emailNotConfirmed");
  if (m.includes("user already registered") || m.includes("already been registered")) return t("auth.errors.alreadyRegistered");
  if (m.includes("password should be at least")) return t("auth.errors.passwordTooShort");
  if (m.includes("pwned") || m.includes("compromised") || m.includes("hibp")) return t("auth.errors.passwordPwned");
  if (m.includes("rate limit") || m.includes("too many")) return t("auth.errors.rateLimit");
  if (m.includes("network") || m.includes("fetch")) return t("auth.errors.network");
  return msg;
};

const passwordStrength = (pwd: string): { score: number; color: string } => {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const colors = ["bg-destructive", "bg-destructive", "bg-warning", "bg-warning", "bg-success", "bg-success"];
  return { score, color: colors[score] };
};

const Auth = () => {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoTenants, setDemoTenants] = useState<Array<{ tenant_id: string; name: string; business_type: string; roles: { role: string; email: string }[] }>>([]);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("ensure-demo-user", { body: { action: "list" } });
        if (data?.tenants) setDemoTenants(data.tenants);
      } catch { /* ignore */ }
    })();
  }, []);

  const bizIcon = (t: string) => t === "bar" ? Store : t === "restaurant" ? UtensilsCrossed : Building2;
  const bizLabel = (t: string) => t === "bar" ? "Bar / Cafetería" : t === "restaurant" ? "Restaurante" : "Empresa / Retail";
  const roleLabel = (r: string) => r === "admin" ? "Administrador" : r === "gerente" ? "Gerente" : "Cajero";

  const loginAsDemo = async (tenantId: string, role: string, tenantName: string) => {
    setDemoLoading(`${tenantId}:${role}`);
    try {
      const { data, error } = await supabase.functions.invoke("ensure-demo-user", {
        body: { action: "ensure", tenant_id: tenantId, role },
      });
      if (error || !data?.email) throw new Error(error?.message || data?.error || "No se pudo preparar el usuario demo");
      const { error: loginErr } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
      if (loginErr) throw loginErr;
      toast.success(`Sesión demo: ${roleLabel(role)} · ${tenantName}`);
    } catch (e: any) {
      toast.error(e.message || "Error al iniciar demo");
    } finally {
      setDemoLoading(null);
    }
  };

  useEffect(() => {
    if (authLoading || !session) return;
    const checkAndRedirect = async () => {
      try {
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
      toast.error(translateAuthError(error.message, t));
      setLoading(false);
    } else {
      toast.success(t("auth.welcome"));
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordStrength(password).score < 2) {
      return toast.error(t("auth.weakPwd"));
    }
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    try {
      const { data, error: fnError } = await supabase.functions.invoke("register-superadmin", {
        body: { email: cleanEmail, password, full_name: fullName },
      });
      if (!fnError && data?.success) {
        toast.success(t("auth.welcome"));
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (loginError) {
          toast.error(translateAuthError(loginError.message, t));
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
    if (error) toast.error(translateAuthError(error.message, t));
    else toast.success(t("auth.accountCreated"));
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(translateAuthError(error.message, t));
    else toast.success(t("auth.resetSent"));
    setLoading(false);
  };

  const pwdStrength = useMemo(() => passwordStrength(password), [password]);

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
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-xl gradient-brand flex items-center justify-center mb-3">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-xl font-bold tracking-tight">MarIA OS</h1>
          <p className="text-xs text-muted-foreground mt-1">{t("auth.tagline")}</p>
        </div>

        <div className="bg-card rounded-2xl shadow-elevated border p-6">
          {view === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="text-center mb-4">
                <h2 className="font-heading font-semibold text-lg">{t("auth.login")}</h2>
                <p className="text-xs text-muted-foreground mt-1">{t("auth.loginSubtitle")}</p>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="email" placeholder={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" required />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={t("auth.password")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="text-right">
                <button type="button" onClick={() => setView("forgot")} className="text-xs text-primary hover:underline">
                  {t("auth.forgotLink")}
                </button>
              </div>

              <Button type="submit" className="w-full gradient-brand text-primary-foreground font-heading font-semibold h-10" disabled={loading}>
                {loading ? t("auth.submitLoading") : t("auth.submitLogin")}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                {t("auth.noAccount")}{" "}
                <button type="button" onClick={() => setView("register")} className="text-primary font-medium hover:underline">
                  {t("auth.doRegister")}
                </button>
              </p>
            </form>
          )}

          {view === "register" && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="text-center mb-4">
                <h2 className="font-heading font-semibold text-lg">{t("auth.register")}</h2>
                <p className="text-xs text-muted-foreground mt-1">{t("auth.registerSubtitle")}</p>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="text" placeholder={t("auth.fullName")} value={fullName} onChange={(e) => setFullName(e.target.value)} className="pl-9" required />
                </div>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="email" placeholder={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" required />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={t("auth.passwordMin")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9"
                    required
                    minLength={6}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
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
                    <p className="text-[10px] text-muted-foreground">{t("auth.security")}: <span className="font-medium">{t(`auth.strength.${pwdStrength.score}`)}</span></p>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full gradient-brand text-primary-foreground font-heading font-semibold h-10" disabled={loading}>
                {loading ? t("auth.submitRegisterLoading") : t("auth.submitRegister")}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                {t("auth.hasAccount")}{" "}
                <button type="button" onClick={() => setView("login")} className="text-primary font-medium hover:underline">
                  {t("auth.doLogin")}
                </button>
              </p>
            </form>
          )}

          {view === "forgot" && (
            <form onSubmit={handleForgot} className="space-y-4">
              <button type="button" onClick={() => setView("login")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
                <ArrowLeft className="h-3 w-3" /> {t("common.back")}
              </button>

              <div className="text-center mb-4">
                <h2 className="font-heading font-semibold text-lg">{t("auth.forgot")}</h2>
                <p className="text-xs text-muted-foreground mt-1">{t("auth.forgotSubtitle")}</p>
              </div>

              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="email" placeholder={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" required />
              </div>

              <Button type="submit" className="w-full gradient-brand text-primary-foreground font-heading font-semibold h-10" disabled={loading}>
                {loading ? t("auth.sending") : t("auth.sendLink")}
              </Button>
            </form>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <div className="rounded-xl border bg-card/50 p-1">
            <LanguageSwitcher />
          </div>
          <InstallPWAPrompt />
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
