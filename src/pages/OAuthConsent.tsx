import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type OAuthDetails = {
  client?: { name?: string; client_name?: string };
  redirect_uri?: string;
  scope?: string;
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};

const oauth = () => (supabase.auth as any).oauth as {
  getAuthorizationDetails: (authorizationId: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  approveAuthorization: (authorizationId: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  denyAuthorization: (authorizationId: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthDetails | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization request.");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const next = window.location.pathname + window.location.search;
        navigate(`/auth?next=${encodeURIComponent(next)}`, { replace: true });
        return;
      }

      setAccountEmail(sessionData.session.user.email ?? null);

      const { data, error: authError } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (authError) {
        setError(authError.message);
        return;
      }

      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }

      setDetails(data);
    })();

    return () => {
      active = false;
    };
  }, [authorizationId, navigate]);

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "this client";
  const scopes = useMemo(() => {
    const raw = details?.scopes ?? details?.scope?.split(" ") ?? [];
    return raw.filter(Boolean);
  }, [details]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    const { data, error: authError } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);

    if (authError) {
      setBusy(false);
      setError(authError.message);
      return;
    }

    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("The authorization server did not return a redirect URL.");
      return;
    }

    window.location.href = target;
  };

  return (
    <main className="min-h-screen bg-background px-4 py-10 flex items-center justify-center">
      <Card className="w-full max-w-lg border-border/70 bg-card/95 shadow-elevated">
        <CardHeader className="space-y-3">
          <div className="h-11 w-11 rounded-lg gradient-brand flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="font-heading text-xl">Connect {clientName} to MarIA OS</CardTitle>
            <CardDescription>
              {clientName} will be able to call MarIA OS agent tools while signed in as you.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex gap-2">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!details && !error ? (
            <div className="py-8 flex items-center justify-center text-sm text-muted-foreground">
              <span className="mr-2 h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              Loading authorization request…
            </div>
          ) : details ? (
            <>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Signed-in account</span>
                  <span className="font-medium truncate">{accountEmail ?? "Current user"}</span>
                </div>
                {details.redirect_uri && (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">Client redirect</span>
                    <span className="font-mono text-xs text-right break-all">{details.redirect_uri}</span>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium">Access summary</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>Use enabled MCP tools for tenants you can already access.</li>
                  <li>Read AI agents, pending business decisions, and open risk alerts.</li>
                  <li>Approve or reject decisions and resolve risk alerts when app permissions allow it.</li>
                  <li>This does not bypass MarIA OS permissions or backend policies.</li>
                </ul>
              </div>

              {scopes.length > 0 && (
                <div className="rounded-lg border bg-background/60 p-3">
                  <p className="text-xs font-medium mb-1">Identity scopes</p>
                  <p className="text-xs text-muted-foreground">{scopes.join(", ")}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button className="flex-1 gradient-brand text-primary-foreground" disabled={busy} onClick={() => decide(true)}>
                  {busy ? "Connecting…" : "Approve"}
                </Button>
                <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decide(false)}>
                  Cancel connection
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}