import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bookmark, Trash2, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface CartItem {
  id: number; name: string; price: number; qty: number; sku?: string; productId: string;
}

interface ParkedSale {
  id: string;
  name: string;
  cart: CartItem[];
  notes: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentCart: CartItem[];
  onResume: (cart: CartItem[]) => void;
}

export function ParkedSalesDialog({ open, onOpenChange, currentCart, onResume }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tenantId } = useTenantContext();
  const [parked, setParked] = useState<ParkedSale[]>([]);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => { if (open && user) refresh(); }, [open, user]);

  const refresh = async () => {
    const { data } = await supabase
      .from("parked_sales" as any)
      .select("id, name, cart, notes, created_at")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    if (data) setParked(data as unknown as ParkedSale[]);
  };

  const save = async () => {
    if (!currentCart.length) return toast.error(t("pos.parked.toasts.emptyCart"));
    if (!name.trim()) return toast.error(t("pos.parked.toasts.nameRequired"));
    const { error } = await supabase.from("parked_sales" as any).insert({
      tenant_id: tenantId,
      user_id: user!.id,
      name: name.trim(),
      cart: currentCart as any,
      notes: notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success(t("pos.parked.toasts.saved"));
    setName(""); setNotes("");
    refresh();
  };

  const resume = async (p: ParkedSale) => {
    onResume(p.cart);
    await supabase.from("parked_sales" as any).delete().eq("id", p.id);
    toast.success(t("pos.parked.toasts.resumed", { name: p.name }));
    onOpenChange(false);
  };

  const remove = async (id: string) => {
    await supabase.from("parked_sales" as any).delete().eq("id", id);
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bookmark className="h-5 w-5" /> {t("pos.parked.title")}</DialogTitle>
          <DialogDescription>{t("pos.parked.desc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
            <Label className="text-xs">{t("pos.parked.saveCurrent", { n: currentCart.length })}</Label>
            <Input placeholder={t("pos.parked.namePh")} value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder={t("pos.parked.notesPh")} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button size="sm" onClick={save} disabled={!currentCart.length} className="w-full gradient-brand text-primary-foreground">
              {t("pos.parked.save")}
            </Button>
          </div>
          <div className="max-h-72 overflow-auto space-y-2">
            {parked.length === 0 && <p className="text-xs text-center text-muted-foreground py-4">{t("pos.parked.empty")}</p>}
            {parked.map((p) => {
              const total = (p.cart || []).reduce((s, i) => s + i.price * i.qty, 0);
              return (
                <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{(p.cart || []).length} {t("pos.parked.items")} · ${total.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px]">{new Date(p.created_at).toLocaleTimeString()}</Badge>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => resume(p)}><PlayCircle className="h-4 w-4 text-primary" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("pos.parked.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
