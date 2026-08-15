import { Helmet } from "react-helmet-async";

export const SITE_URL = "https://bizzen-aura.lovable.app";
const DEFAULT_IMAGE = `${SITE_URL}/og-image.jpg`;

interface SeoProps {
  /** Título único de la ruta (sin el sufijo de marca). */
  title: string;
  /** Descripción única de la ruta, < 160 caracteres. */
  description: string;
  /** Ruta canónica auto-referenciada, p.ej. "/marketplace". */
  path: string;
  /** og:type — "website" para páginas, "product" para artículos del marketplace. */
  type?: "website" | "product" | "article";
  /** Imagen social absoluta o relativa a la raíz del sitio. */
  image?: string;
  /** JSON-LD adicional (Product, BreadcrumbList, …). */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noindex?: boolean;
}

/**
 * Metadatos por ruta (title / description / canonical / Open Graph / JSON-LD).
 * Los tags de index.html quedan como respaldo para crawlers sin JavaScript.
 */
export const Seo = ({
  title,
  description,
  path,
  type = "website",
  image,
  jsonLd,
  noindex,
}: SeoProps) => {
  const url = `${SITE_URL}${path}`;
  const fullTitle = title.includes("MarIA OS") ? title : `${title} — MarIA OS`;
  const img = image
    ? image.startsWith("http")
      ? image
      : `${SITE_URL}${image.startsWith("/") ? "" : "/"}${image}`
    : DEFAULT_IMAGE;
  const blocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet prioritizeSeoTags>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={img} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={img} />

      {blocks.map((block, i) => (
        <script type="application/ld+json" key={i}>
          {JSON.stringify(block)}
        </script>
      ))}
    </Helmet>
  );
};
