import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";
import { Copy, Trash2, Plus } from "lucide-react";

const ALL_EVENTS = ["sale.created", "shift.closed", "stock.low"];

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomKey() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `maria_${hex}`;
}

export default function Developers() {
  const tenantId = useTenant();
  const [keys, setKeys] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const [whName, setWhName] = useState("");
  const [whUrl, setWhUrl] = useState("");
  const [whEvents, setWhEvents] = useState<string[]>(["sale.created"]);

  const load = async () => {
    if (!tenantId) return;
    const [{ data: k }, { data: w }] = await Promise.all([
      supabase.from("tenant_api_keys").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("webhooks").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    ]);
    setKeys(k || []);
    setWebhooks(w || []);
  };
  useEffect(() => { load(); }, [tenantId]);

  const createKey = async () => {
    if (!tenantId || !newKeyName.trim()) return;
    const raw = randomKey();
    const hash = await sha256Hex(raw);
    const { error } = await supabase.from("tenant_api_keys").insert({
      tenant_id: tenantId, name: newKeyName, key_prefix: raw.slice(0, 12),
      key_hash: hash, scopes: ["read"],
    });
    if (error) { toast.error(error.message); return; }
    setNewSecret(raw);
    setNewKeyName("");
    load();
  };

  const revokeKey = async (id: string) => {
    await supabase.from("tenant_api_keys").update({ is_active: false }).eq("id", id);
    load();
  };

  const createWebhook = async () => {
    if (!tenantId || !whUrl) return;
    const { error } = await supabase.from("webhooks").insert({
      tenant_id: tenantId, name: whName || whUrl, url: whUrl, events: whEvents,
    });
    if (error) { toast.error(error.message); return; }
    setWhName(""); setWhUrl(""); setWhEvents(["sale.created"]);
    load();
  };

  const deleteWebhook = async (id: string) => {
    await supabase.from("webhooks").delete().eq("id", id);
    load();
  };

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-v1`;

  return (
    <AppLayout title="API & Webhooks">
      <Tabs defaultValue="keys" className="space-y-4">
        <TabsList>
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="docs">Documentación</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Nueva API Key</CardTitle></CardHeader>
            <CardContent className="flex gap-2">
              <Input placeholder="Nombre (ej: integración Zapier)" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
              <Button onClick={createKey}><Plus className="h-4 w-4 mr-1" />Generar</Button>
            </CardContent>
          </Card>

          {newSecret && (
            <Card className="border-warning bg-warning/10">
              <CardContent className="pt-4 space-y-2">
                <p className="text-sm font-semibold">⚠️ Copia esta clave ahora. No volverá a mostrarse.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-background p-2 rounded break-all">{newSecret}</code>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(newSecret); toast.success("Copiada"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setNewSecret(null)}>Entendido</Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Claves activas</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {keys.length === 0 && <p className="text-sm text-muted-foreground">Sin claves todavía.</p>}
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <div className="font-medium text-sm">{k.name}</div>
                    <div className="text-xs text-muted-foreground">{k.key_prefix}… · {k.scopes?.join(", ")} · {k.last_used_at ? `usada ${new Date(k.last_used_at).toLocaleString()}` : "sin uso"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={k.is_active ? "default" : "outline"}>{k.is_active ? "Activa" : "Revocada"}</Badge>
                    {k.is_active && <Button size="sm" variant="ghost" onClick={() => revokeKey(k.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Nuevo webhook</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label>Nombre</Label><Input value={whName} onChange={(e) => setWhName(e.target.value)} /></div>
                <div><Label>URL</Label><Input placeholder="https://tu-servicio/webhook" value={whUrl} onChange={(e) => setWhUrl(e.target.value)} /></div>
              </div>
              <div>
                <Label className="mb-2 block">Eventos</Label>
                <div className="flex flex-wrap gap-2">
                  {ALL_EVENTS.map((ev) => (
                    <Badge
                      key={ev}
                      variant={whEvents.includes(ev) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setWhEvents((p) => p.includes(ev) ? p.filter((x) => x !== ev) : [...p, ev])}
                    >{ev}</Badge>
                  ))}
                </div>
              </div>
              <Button onClick={createWebhook}><Plus className="h-4 w-4 mr-1" />Crear webhook</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Webhooks activos</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {webhooks.length === 0 && <p className="text-sm text-muted-foreground">Sin webhooks.</p>}
              {webhooks.map((w) => (
                <div key={w.id} className="flex items-start justify-between p-2 border rounded">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{w.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{w.url}</div>
                    <div className="text-xs mt-1 flex flex-wrap gap-1">
                      {w.events?.map((e: string) => <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">secret: <code>{w.secret.slice(0, 12)}…</code> · fallos: {w.failure_count}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => deleteWebhook(w.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs">
          <Card>
            <CardHeader><CardTitle>API REST v1</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium">Base URL</p>
                <code className="text-xs bg-muted p-2 rounded block break-all">{apiUrl}</code>
              </div>
              <div>
                <p className="font-medium">Autenticación</p>
                <p className="text-muted-foreground">Cabecera <code>x-api-key: TU_CLAVE</code></p>
              </div>
              <div>
                <p className="font-medium">Endpoints</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li><code>GET /products?limit=100</code></li>
                  <li><code>GET /sales?limit=50&from=2026-01-01</code></li>
                  <li><code>GET /stock</code></li>
                  <li><code>GET /customers</code></li>
                </ul>
              </div>
              <div>
                <p className="font-medium">Firma de webhooks</p>
                <p className="text-muted-foreground">Cabecera <code>X-MarIA-Signature</code> = HMAC-SHA256(secret, body). Valida en tu servidor antes de procesar.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
