import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart, HeatmapChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  MarkLineComponent,
  DataZoomComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

echarts.use([
  BarChart, LineChart, PieChart, HeatmapChart, ScatterChart,
  GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, MarkLineComponent, DataZoomComponent,
  SVGRenderer,
]);

/** Resolve CSS custom properties (e.g. "var(--brand)") so ECharts receives concrete colours. */
export function cssVar(v: string) {
  const m = /^var\((--[\w-]+)\)$/.exec(v.trim());
  if (!m) return v;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || v;
}

function resolveDeep<T>(o: T): T {
  if (typeof o === "string") return cssVar(o) as T;
  if (Array.isArray(o)) return o.map(resolveDeep) as T;
  if (o && typeof o === "object" && !(o instanceof Function)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = typeof v === "function" ? v : resolveDeep(v);
    return out as T;
  }
  return o;
}

function base(): EChartsCoreOption {
  const text2 = cssVar("var(--text-2)");
  const text3 = cssVar("var(--text-3)");
  const border = cssVar("var(--border)");
  return {
    textStyle: { fontFamily: "Inter Variable, Inter, system-ui, sans-serif", color: text2 },
    animationDuration: 500,
    grid: { left: 8, right: 12, top: 28, bottom: 4, containLabel: true },
    tooltip: {
      backgroundColor: cssVar("var(--bg-elev)"),
      borderColor: cssVar("var(--border-strong)"),
      textStyle: { color: cssVar("var(--text)"), fontSize: 12 },
      extraCssText: "border-radius:6px;box-shadow:none;padding:8px 10px;font-variant-numeric:tabular-nums;",
    },
    legend: { textStyle: { color: text2, fontSize: 11.5 }, icon: "rect", itemWidth: 8, itemHeight: 8, itemGap: 14, top: 0, left: 0 },
    xAxis: {
      axisLine: { lineStyle: { color: border } },
      axisTick: { show: false },
      axisLabel: { color: text3, fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: text3, fontSize: 11 },
      splitLine: { lineStyle: { color: border } },
    },
  };
}

function merge(a: any, b: any): any {
  if (Array.isArray(b)) return b.map((x) => (Array.isArray(a) ? x : merge(a, x)));
  if (b && typeof b === "object" && a && typeof a === "object" && !Array.isArray(a)) {
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = merge(a[k], b[k]);
    return out;
  }
  return b === undefined ? a : b;
}

export function Chart({ option, height = 280, onClick }: { option: EChartsCoreOption; height?: number; onClick?: (p: any) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: "svg" });
    inst.current = c;
    c.on("click", (p) => clickRef.current?.(p));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
    };
  }, []);

  useEffect(() => {
    const apply = () => {
      const b = base();
      const o = resolveDeep(option) as any;
      const full: any = { ...b, ...o };
      for (const k of ["grid", "tooltip", "legend", "textStyle"]) if (o[k] !== undefined) full[k] = merge(b[k as keyof typeof b], o[k]);
      for (const k of ["xAxis", "yAxis"]) if (o[k] !== undefined) full[k] = merge(b[k as keyof typeof b], o[k]);
      inst.current?.setOption(full, true);
    };
    apply();
    window.addEventListener("radar-theme", apply);
    return () => window.removeEventListener("radar-theme", apply);
  }, [option]);

  return <div ref={el} style={{ width: "100%", height }} />;
}
