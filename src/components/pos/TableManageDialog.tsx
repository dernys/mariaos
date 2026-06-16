import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save } from "lucide-react";
import { useTranslation } from "react-i18next";

interface TableData {
  id?: string;
  name: string;
  capacity: number;
  shape: string;
  position_x: number;
  position_y: number;
}

interface TableManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table?: TableData | null;
  onSaved: () => void;
}

export function TableManageDialog({ open, onOpenChange, table, onSaved }: TableManageDialogProps) {
  const { t } = useTranslation();
  const { tenantId } = useTenantContext();
  const { toast } = useToast();
  const [form, setForm] = useState<TableData>({
    name: "",
    capacity: 4,
    shape: "square",
    position_x: 0,
    position_y: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && table) {
      setForm({
        id: table.id,
        name: table.name,
        capacity: table.capacity,
        shape: table.shape,
        position_x: table.position_x,
        position_y: table.position_y,
      });
    } else if (open) {
      setForm({ name: "", capacity: 4, shape: "square", position_x: 0, position_y: 0 });
    }
  }, [open, table]);

  const handleSave = async () => {
    if (!form.name.trim() || !tenantId) return;
    setSaving(true);
    try {
      if (form.id) {
        await supabase.from("restaurant_tables").update({
          name: form.name,
          capacity: form.capacity,
          shape: form.shape,
          position_x: form.position_x,
          position_y: form.position_y,
        }).eq("id", form.id);
        toast({ title: t("pos.tableDialog.tableUpdated") });
      } else {
        await supabase.from("restaurant_tables").insert({
          tenant_id: tenantId,
          name: form.name,
          capacity: form.capacity,
          shape: form.shape,
          position_x: form.position_x,
          position_y: form.position_y,
        });
        toast({ title: t("pos.tableDialog.tableCreated") });
      }
      onSaved();
      onOpenChange(false);
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!form.id) return;
    setSaving(true);
    await supabase.from("restaurant_tables").delete().eq("id", form.id);
    toast({ title: t("pos.tableDialog.tableDeleted") });
    onSaved();
    onOpenChange(false);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{form.id ? t("pos.tableDialog.edit") : t("pos.tableDialog.new")}</DialogTitle>
          <DialogDescription>{t("pos.tableDialog.desc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">{t("pos.tableDialog.name")}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("pos.tableDialog.namePh")} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("pos.tableDialog.capacity")}</Label>
              <Input type="number" min={1} max={20} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 1 })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("pos.tableDialog.shape")}</Label>
              <Select value={form.shape} onValueChange={(v) => setForm({ ...form, shape: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="square">{t("pos.tableDialog.shapes.square")}</SelectItem>
                  <SelectItem value="round">{t("pos.tableDialog.shapes.round")}</SelectItem>
                  <SelectItem value="rectangle">{t("pos.tableDialog.shapes.rectangle")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("pos.tableDialog.rowY")}</Label>
              <Input type="number" min={0} value={form.position_y} onChange={(e) => setForm({ ...form, position_y: parseInt(e.target.value) || 0 })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("pos.tableDialog.colX")}</Label>
              <Input type="number" min={0} value={form.position_x} onChange={(e) => setForm({ ...form, position_x: parseInt(e.target.value) || 0 })} className="mt-1" />
            </div>
          </div>
          <div className="flex gap-2">
            {form.id && (
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving} className="gap-1 text-xs">
                <Trash2 className="h-3 w-3" /> {t("pos.tableDialog.delete")}
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="flex-1 gap-1 text-xs">
              <Save className="h-3 w-3" /> {form.id ? t("pos.tableDialog.save") : t("pos.tableDialog.create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
