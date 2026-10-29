import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/** Horizontal strip of cards with scroll arrows that appear only when there is more to see. */
export function Carousel({ children }: { children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  const update = () => {
    const el = track.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };

  useEffect(() => {
    update();
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const go = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <div className="carousel">
      <div className="carousel-track" ref={track} onScroll={update}>
        {children}
      </div>
      {edge.left && (
        <button className="carousel-btn left" onClick={() => go(-1)} aria-label="Cuộn trái">
          <Icon name="chevronLeft" />
        </button>
      )}
      {edge.right && (
        <button className="carousel-btn right" onClick={() => go(1)} aria-label="Cuộn phải">
          <Icon name="chevronRight" />
        </button>
      )}
    </div>
  );
}
