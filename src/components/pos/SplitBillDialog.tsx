import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, SplitSquareVertical, Check } from "lucide-react";

interface CartItem {
  id: number;
  name: string;
  price: number;
  qty: number;
}

interface SplitResult {
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
}

interface SplitBillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  onSplitConfirm: (splits: SplitResult[]) => void;
}

export function SplitBillDialog({
  open,
  onOpenChange,
  cart,
  subtotal,
  tax,
  total,
  onSplitConfirm,
}: SplitBillDialogProps) {
  const [splitType, setSplitType] = useState<"equal" | "items">("equal");
  const [numPeople, setNumPeople] = useState(2);
  const [assignments, setAssignments] = useState<Record<number, number>>({});

  const taxRate = subtotal > 0 ? tax / subtotal : 0;

  const handleEqualSplit = () => {
    const perPerson = total / numPeople;
    const subPerPerson = subtotal / numPeople;
    const taxPerPerson = tax / numPeople;
    const splits: SplitResult[] = Array.from({ length: numPeople }, (_, i) => ({
      items: cart.map((item) => ({ ...item, qty: item.qty, price: item.price / numPeople })),
      subtotal: subPerPerson,
      tax: taxPerPerson,
      total: perPerson,
    }));
    onSplitConfirm(splits);
    onOpenChange(false);
  };

  const handleItemsSplit = () => {
    const groups: Record<number, CartItem[]> = {};
    cart.forEach((item) => {
      const person = assignments[item.id] || 0;
      if (!groups[person]) groups[person] = [];
      groups[person].push(item);
    });

    const splits: SplitResult[] = Object.values(groups).map((items) => {
      const sub = items.reduce((s, i) => s + i.price * i.qty, 0);
      const t = sub * taxRate;
      return { items, subtotal: sub, tax: t, total: sub + t };
    });
    onSplitConfirm(splits);
    onOpenChange(false);
  };

  const assignItem = (itemId: number, person: number) => {
    setAssignments((prev) => ({ ...prev, [itemId]: person }));
  };

  const personColors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <SplitSquareVertical className="h-5 w-5 text-primary" />
            Dividir Cuenta
          </DialogTitle>
          <DialogDescription>
            Total: <span className="font-bold text-primary">${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </DialogDescription>
        </DialogHeader>

        <Tabs value={splitType} onValueChange={(v) => setSplitType(v as "equal" | "items")}>
          <TabsList className="w-full">
            <TabsTrigger value="equal" className="flex-1 gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" /> Partes iguales
            </TabsTrigger>
            <TabsTrigger value="items" className="flex-1 gap-1.5 text-xs">
              <SplitSquareVertical className="h-3.5 w-3.5" /> Por consumo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="equal" className="space-y-4 mt-4">
            <div>
              <Label className="text-xs">Número de personas</Label>
              <div className="flex items-center gap-3 mt-1">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    onClick={() => setNumPeople(n)}
                    className={`h-10 w-10 rounded-lg text-sm font-heading font-bold transition-all ${
                      numPeople === n
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <Input
                  type="number"
                  min={2}
                  max={20}
                  value={numPeople}
                  onChange={(e) => setNumPeople(Math.max(2, parseInt(e.target.value) || 2))}
                  className="w-16 h-10 text-center text-sm font-bold"
                />
              </div>
            </div>

            <div className="bg-muted/40 rounded-lg p-4 space-y-2">
              <p className="text-xs text-muted-foreground">Cada persona paga:</p>
              <p className="text-2xl font-heading font-bold text-primary">
                ${(total / numPeople).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Subtotal: ${(subtotal / numPeople).toFixed(2)} + Impuesto: ${(tax / numPeople).toFixed(2)}
              </p>
            </div>

            <Button onClick={handleEqualSplit} className="w-full gradient-brand text-primary-foreground font-heading h-11">
              <Check className="h-4 w-4 mr-2" /> Confirmar división en {numPeople}
            </Button>
          </TabsContent>

          <TabsContent value="items" className="space-y-4 mt-4">
            <div>
              <Label className="text-xs mb-2 block">Número de personas</Label>
              <div className="flex gap-2">
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setNumPeople(n)}
                    className={`h-8 w-8 rounded-md text-xs font-bold transition-all ${
                      numPeople === n ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Asignar platos a cada persona</Label>
              {cart.map((item) => (
                <div key={item.id} className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.qty}× {item.name}</p>
                    <p className="text-[10px] text-muted-foreground">${(item.price * item.qty).toFixed(2)}</p>
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: numPeople }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => assignItem(item.id, i)}
                        className={`h-7 w-7 rounded-md text-[10px] font-bold text-white transition-all ${
                          (assignments[item.id] ?? 0) === i
                            ? personColors[i % personColors.length]
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        P{i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Preview */}
            <div className="space-y-2">
              {Array.from({ length: numPeople }, (_, i) => {
                const personItems = cart.filter((item) => (assignments[item.id] ?? 0) === i);
                const personSub = personItems.reduce((s, item) => s + item.price * item.qty, 0);
                const personTotal = personSub + personSub * taxRate;
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`h-5 w-5 rounded-md ${personColors[i % personColors.length]} text-white text-[10px] font-bold flex items-center justify-center`}>
                      P{i + 1}
                    </span>
                    <span className="flex-1">{personItems.length} platos</span>
                    <span className="font-heading font-bold">${personTotal.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>

            <Button onClick={handleItemsSplit} className="w-full gradient-brand text-primary-foreground font-heading h-11">
              <Check className="h-4 w-4 mr-2" /> Confirmar división por consumo
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
