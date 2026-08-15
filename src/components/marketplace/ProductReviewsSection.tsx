import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Star, Trash2, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { RatingStars } from "./RatingStars";
import type { ProductReview } from "./types";

interface Props {
  productId: string;
  tenantId: string;
  ratingAvg?: number | null;
  reviewsCount?: number | null;
}

export const ProductReviewsSection = ({ productId, tenantId, ratingAvg, reviewsCount }: Props) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Columnas públicas: nunca se solicita customer_id (identidad del cliente).
  const PUBLIC_COLS =
    "id,tenant_id,product_id,rating,title,comment,is_verified_purchase,is_visible,created_at";

  const load = async () => {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    const cols = session?.session ? `${PUBLIC_COLS},user_id` : PUBLIC_COLS;
    const { data } = await supabase
      .from("product_reviews" as any)
      .select(cols)
      .eq("product_id", productId)
      .eq("is_visible", true)
      .order("created_at", { ascending: false })
      .limit(50);
    setReviews(((data as any) ?? []) as ProductReview[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [productId]);

  const location = useLocation();
  const canReview = !!user && !!(user as any).email_confirmed_at;
  const myReview = user ? reviews.find((r) => r.user_id === user.id) : null;

  const submit = async () => {
    if (!canReview) {
      toast({ title: t("marketplace.reviews.loginRequired"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const payload: any = {
      tenant_id: tenantId,
      product_id: productId,
      user_id: user.id,
      rating,
      title: title.trim() || null,
      comment: comment.trim() || null,
    };
    const { error } = myReview
      ? await supabase.from("product_reviews" as any).update(payload).eq("id", myReview.id)
      : await supabase.from("product_reviews" as any).insert(payload);
    setSubmitting(false);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("marketplace.reviews.saved") });
    setTitle(""); setComment(""); setRating(5);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("product_reviews" as any).delete().eq("id", id);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  return (
    <section className="mt-10 space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">{t("marketplace.reviews.title")}</h2>
          <div className="flex items-center gap-2 mt-1">
            <RatingStars value={ratingAvg ?? 0} size={16} />
            <span className="text-sm font-semibold">{(ratingAvg ?? 0).toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">
              ({reviewsCount ?? 0} {t("marketplace.reviews.count")})
            </span>
          </div>
        </div>
      </div>

      {!canReview ? (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-2 text-center">
          <ShieldCheck className="h-6 w-6 text-primary mx-auto" />
          <p className="text-sm font-medium">
            {user ? "Confirma tu correo para poder comentar" : t("marketplace.reviews.loginRequired")}
          </p>
          <p className="text-xs text-muted-foreground">
            {user
              ? "Te enviamos un enlace de verificación al registrarte. Actívalo y vuelve a esta página."
              : "Solo los compradores con cuenta verificada pueden valorar y comentar productos."}
          </p>
          {!user && (
            <Button asChild size="sm" className="rounded-full mt-1">
              <Link to={`/marketplace/acceso?next=${encodeURIComponent(location.pathname)}`}>
                {t("marketplace.createAccount")}
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <p className="text-sm font-medium">
            {myReview ? t("marketplace.reviews.editYours") : t("marketplace.reviews.writeYours")}
          </p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className="p-1 hover:scale-110 transition-transform"
                aria-label={`${n} stars`}
              >
                <Star className={`h-6 w-6 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
              </button>
            ))}
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("marketplace.reviews.titlePh")}
            maxLength={120}
          />
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("marketplace.reviews.commentPh")}
            rows={3}
            maxLength={1000}
          />
          <Button onClick={submit} disabled={submitting} className="rounded-full">
            {submitting ? t("common.saving") : myReview ? t("common.save") : t("marketplace.reviews.publish")}
          </Button>
        </div>
      )}


      <div className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {!loading && reviews.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("marketplace.reviews.empty")}</p>
        )}
        {reviews.map((r) => (
          <div key={r.id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <RatingStars value={r.rating} size={14} />
                {r.title && <p className="font-semibold text-sm mt-1">{r.title}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
                {user?.id === r.user_id && (
                  <button
                    onClick={() => remove(r.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {r.comment && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{r.comment}</p>}
          </div>
        ))}
      </div>
    </section>
  );
};
