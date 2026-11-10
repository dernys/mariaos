import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { Zap, Mail, Lock, Eye, EyeOff, ArrowLeft, ShieldCheck, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { InstallPWAPrompt } from "@/components/InstallPWAPrompt";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { checkSuperadmin } from "@/lib/checkSuperadmin";

type AuthView = "login" | "forgot";

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

const Auth = () => {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const getSafeNext = () => {
    const next = searchParams.get("next");
    if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
    return next;
  };

  useEffect(() => {
    if (authLoading || !session) return;
    let cancelled = false;
    const checkAndRedirect = async () => {
      try {
        const next = getSafeNext();
        if (next) return navigate(next, { replace: true });
        const isSA = await checkSuperadmin(session.user.id);
        if (!cancelled) navigate(isSA ? "/superadmin" : "/app", { replace: true });
      } catch {
        if (!cancelled) navigate("/app", { replace: true });
      }
    };
    checkAndRedirect();
    return () => { cancelled = true; };
  }, [session, authLoading, navigate, searchParams]);

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

  if (authLoading || session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
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

        {/* Governance notice: business accounts are provisioned, not self-registered */}
        <div className="mt-4 rounded-2xl border bg-card/70 backdrop-blur p-3 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <p className="text-xs font-heading font-semibold">Acceso corporativo controlado</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Los usuarios de empresa (administradores, gerentes, cajeros, contadores y empleados) los crea el
            superadministrador o el administrador de cada negocio. Aquí no hay registro público.
          </p>
          <Link
            to="/marketplace/acceso?view=register"
            className="inline-flex items-center gap-1.5 text-[11px] text-primary font-medium hover:underline"
          >
            <ShoppingBag className="h-3.5 w-3.5" /> ¿Eres comprador? Crea tu cuenta del marketplace
          </Link>
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
