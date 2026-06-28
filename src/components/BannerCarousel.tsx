import { useEffect, useState } from "react";

export type BannerItem = { id: string; title: string; subtitle: string; image: string };

export function BannerCarousel({ banners }: { banners: BannerItem[] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % banners.length), 4500);
    return () => clearInterval(t);
  }, [banners.length, paused]);

  useEffect(() => {
    if (idx >= banners.length) setIdx(0);
  }, [banners.length, idx]);

  if (banners.length === 0) return null;

  const go = (n: number) => setIdx(((n % banners.length) + banners.length) % banners.length);

  return (
    <div
      className="relative -mx-4 mb-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <div className="relative h-[200px] sm:h-[260px] overflow-hidden">
        {banners.map((b, i) => (
          <div
            key={b.id}
            className="absolute inset-0 transition-opacity duration-700 ease-out"
            style={{
              opacity: i === idx ? 1 : 0,
              pointerEvents: i === idx ? "auto" : "none",
              background: "#000",
            }}
          >
            <img
              src={b.image}
              alt={b.title}
              className="absolute inset-0 h-full w-full object-contain"
              loading={i === 0 ? "eager" : "lazy"}
            />
          </div>
        ))}
      </div>

      {banners.length > 1 && (
        <>
          <button
            onClick={() => go(idx - 1)}
            aria-label="Anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur"
          >
            ‹
          </button>
          <button
            onClick={() => go(idx + 1)}
            aria-label="Próximo"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur"
          >
            ›
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => go(i)}
                aria-label={`Slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
