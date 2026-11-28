import type { Metadata } from "next";
import { getProduct, productSummary, publicAsset } from "@/lib/api";

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Không tìm thấy ứng dụng", robots: { index: false, follow: true } };
  return {
    title: product.title,
    description: productSummary(product).slice(0, 160),
    alternates: { canonical: "/apps/" + encodeURIComponent(product.slug) },
    openGraph: {
      type: "website",
      title: product.title,
      description: productSummary(product).slice(0, 200),
      images: [publicAsset(product.cover || product.icon)]
    }
  };
}

export default async function AppDetail({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) {
    return <main className="page-shell"><div className="empty"><h1 className="text-2xl font-bold">Không tìm thấy ứng dụng</h1><a className="button" href="/">Về cửa hàng</a></div></main>;
  }
  return (
    <main className="page-shell">
      <article className="detail">
        <div className="detail-header">
          <img className="detail-icon" src={publicAsset(product.icon)} alt={product.title} />
          <div className="min-w-0">
            <span className="kicker">{product.category}</span>
            <h1>{product.title}</h1>
            <p className="muted text-sm">Phát triển bởi {product.developer} · Phiên bản {product.version}</p>
          </div>
        </div>
        <div className="detail-description">{product.description || productSummary(product)}</div>
        <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-500">
          <span>Hệ điều hành: {product.platform}</span>
          <span>·</span>
          <span>★ {Number(product.rating || 0).toFixed(1)}</span>
          <span>·</span>
          <span>{Number(product.downloads || 0).toLocaleString("vi-VN")} lượt tải</span>
        </div>
        <a className="button mt-8" href={"https://hendystore.onrender.com/apps/" + encodeURIComponent(product.slug)}>Xem trang tải và cài đặt</a>
      </article>
    </main>
  );
}
