import { Star } from "lucide-react";

interface Props {
  value: number;
  size?: number;
  className?: string;
}

export const RatingStars = ({ value, size = 12, className = "" }: Props) => {
  const full = Math.round(value);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${value.toFixed(1)} de 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i < full ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}
        />
      ))}
    </span>
  );
};
