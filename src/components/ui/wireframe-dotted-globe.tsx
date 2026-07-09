import { useEffect, useRef, useState } from "react";
import { geoGraticule, geoInterpolate, geoOrthographic, geoPath } from "d3-geo";
import { timer } from "d3-timer";
import { COUNTRY_CENTROIDS } from "@/lib/flags";
import { getGlobeLandCache, loadGlobeLandData, type GlobeDot } from "@/lib/globeLandData";

interface WireframeDottedGlobeProps {
  width?: number;
  height?: number;
  className?: string;
  /** Lowercase ISO-2 codes to highlight as corridor destinations. */
  highlightCountries?: string[];
  /** Compact dashboard mode — hides interaction hint. */
  compact?: boolean;
  /** Disable drag/zoom (dashboard embed). */
  interactive?: boolean;
}

type GeoFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

export default function WireframeDottedGlobe({
  width = 240,
  height = 240,
  className = "",
  highlightCountries = [],
  compact = false,
  interactive = true,
}: WireframeDottedGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(() => !getGlobeLandCache());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const containerWidth = width;
    const containerHeight = height;
    const radius = Math.min(containerWidth, containerHeight) / 2.35;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerWidth * dpr;
    canvas.height = containerHeight * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;
    context.scale(dpr, dpr);

    const projection = geoOrthographic()
      .scale(radius)
      .translate([containerWidth / 2, containerHeight / 2])
      .clipAngle(90);

    const path = geoPath().projection(projection).context(context);

    interface DotData {
      lng: number;
      lat: number;
    }

    const allDots: DotData[] = [];
    let landFeatures: GeoJSON.FeatureCollection | null = getGlobeLandCache()?.landFeatures ?? null;
    if (getGlobeLandCache()) {
      allDots.push(...getGlobeLandCache()!.dots);
      setIsLoading(false);
    }

    const readTheme = () => {
      const root = getComputedStyle(document.documentElement);
      const primary = root.getPropertyValue("--primary").trim() || "262 83% 47%";
      const isDark = document.documentElement.classList.contains("dark");
      return {
        oceanInner: isDark ? "#0c1224" : "#dbeafe",
        oceanOuter: isDark ? "#060a14" : "#eef2ff",
        stroke: isDark ? "hsl(0 0% 100% / 0.62)" : "hsl(222 47% 28% / 0.45)",
        dot: isDark ? "hsl(0 0% 100% / 0.42)" : "hsl(222 47% 35% / 0.5)",
        marker: `hsl(${primary})`,
        markerBright: `hsl(${primary} / 0.95)`,
        markerGlow: `hsl(${primary} / 0.45)`,
        arc: `hsl(${primary} / 0.55)`,
        graticule: isDark ? "hsl(0 0% 100% / 0.14)" : "hsl(222 47% 20% / 0.14)",
        atmosphere: isDark ? `hsl(${primary} / 0.22)` : `hsl(${primary} / 0.18)`,
      };
    };

    let theme = readTheme();
    let animTime = 0;

    const drawArc = (from: [number, number], to: [number, number], phase: number) => {
      const interpolate = geoInterpolate(from, to);
      const cx = containerWidth / 2;
      const cy = containerHeight / 2;
      const currentScale = projection.scale();
      let started = false;

      context.beginPath();
      for (let t = 0; t <= 1; t += 0.025) {
        const projected = projection(interpolate(t));
        if (!projected) continue;
        const [px, py] = projected;
        if (Math.hypot(px - cx, py - cy) > currentScale * 0.98) {
          started = false;
          continue;
        }
        if (!started) {
          context.moveTo(px, py);
          started = true;
        } else {
          context.lineTo(px, py);
        }
      }
      const dash = 4 + Math.sin(animTime * 2 + phase) * 1.5;
      context.setLineDash([dash, dash * 1.6]);
      context.lineDashOffset = -animTime * 18;
      context.strokeStyle = theme.arc;
      context.lineWidth = 1.35 * (projection.scale() / radius);
      context.stroke();
      context.setLineDash([]);
      context.lineDashOffset = 0;
    };

    const render = () => {
      context.clearRect(0, 0, containerWidth, containerHeight);
      const currentScale = projection.scale();
      const scaleFactor = currentScale / radius;
      const cx = containerWidth / 2;
      const cy = containerHeight / 2;

      const oceanGrad = context.createRadialGradient(cx, cy, currentScale * 0.1, cx, cy, currentScale);
      oceanGrad.addColorStop(0, theme.oceanInner);
      oceanGrad.addColorStop(1, theme.oceanOuter);
      context.beginPath();
      context.arc(cx, cy, currentScale, 0, 2 * Math.PI);
      context.fillStyle = oceanGrad;
      context.fill();

      context.beginPath();
      context.arc(cx, cy, currentScale + 3 * scaleFactor, 0, 2 * Math.PI);
      context.strokeStyle = theme.atmosphere;
      context.lineWidth = 5 * scaleFactor;
      context.stroke();

      context.beginPath();
      context.arc(cx, cy, currentScale, 0, 2 * Math.PI);
      context.strokeStyle = theme.stroke;
      context.lineWidth = 1.5 * scaleFactor;
      context.stroke();

      if (landFeatures) {
        const graticule = geoGraticule();
        context.beginPath();
        path(graticule());
        context.strokeStyle = theme.graticule;
        context.lineWidth = 0.75 * scaleFactor;
        context.stroke();

        context.beginPath();
        landFeatures.features.forEach((feature) => {
          path(feature as GeoFeature);
        });
        context.strokeStyle = theme.stroke;
        context.lineWidth = 1 * scaleFactor;
        context.stroke();

        allDots.forEach((dot) => {
          const projected = projection([dot.lng, dot.lat]);
          if (!projected) return;
          const [px, py] = projected;
          const dist = Math.hypot(px - cx, py - cy);
          if (dist > currentScale) return;
          context.beginPath();
          context.arc(px, py, 1.15 * scaleFactor, 0, 2 * Math.PI);
          context.fillStyle = theme.dot;
          context.fill();
        });

        if (highlightCountries.length > 1) {
          highlightCountries.forEach((cc, i) => {
            const a = COUNTRY_CENTROIDS[cc];
            const b = COUNTRY_CENTROIDS[highlightCountries[(i + 1) % highlightCountries.length]];
            if (a && b) drawArc(a, b, i * 0.9);
          });
        }

        highlightCountries.forEach((cc, i) => {
          const coords = COUNTRY_CENTROIDS[cc];
          if (!coords) return;
          const projected = projection(coords);
          if (!projected) return;
          const [px, py] = projected;
          const dist = Math.hypot(px - cx, py - cy);
          if (dist > currentScale * 0.92) return;

          const pulse = 0.5 + 0.5 * Math.sin(animTime * 3 + i * 1.4);
          const ringR = (8 + pulse * 6) * scaleFactor;

          context.beginPath();
          context.arc(px, py, ringR, 0, 2 * Math.PI);
          context.fillStyle = theme.markerGlow;
          context.fill();

          context.beginPath();
          context.arc(px, py, (3.5 + pulse * 1.2) * scaleFactor, 0, 2 * Math.PI);
          context.fillStyle = theme.markerBright;
          context.fill();
          context.strokeStyle = "hsl(0 0% 100% / 0.85)";
          context.lineWidth = 1.25 * scaleFactor;
          context.stroke();
        });
      }
    };

    const loadWorldData = async () => {
      if (landFeatures) return;
      try {
        const data = await loadGlobeLandData(compact);
        landFeatures = data.landFeatures;
        allDots.length = 0;
        data.dots.forEach((dot: GlobeDot) => allDots.push(dot));
        render();
        setIsLoading(false);
      } catch {
        setError("Failed to load Earth visualization");
        setIsLoading(false);
      }
    };

    const rotation: [number, number] = [highlightCountries.length ? -20 : 0, -18];
    let autoRotate = !reducedMotion;
    const rotationSpeed = 0.45;

    if (highlightCountries[0] && COUNTRY_CENTROIDS[highlightCountries[0]]) {
      rotation[0] = -COUNTRY_CENTROIDS[highlightCountries[0]][0];
      rotation[1] = -COUNTRY_CENTROIDS[highlightCountries[0]][1] + 12;
    }
    projection.rotate(rotation);
    render();

    const tick = (elapsed: number) => {
      if (document.hidden) return;
      animTime = elapsed / 1000;
      if (autoRotate) {
        rotation[0] += rotationSpeed;
        projection.rotate(rotation);
      }
      render();
    };

    const rotationTimer = timer(tick);

    const visibilityObserver =
      typeof IntersectionObserver !== "undefined" && containerRef.current
        ? new IntersectionObserver(
            ([entry]) => {
              autoRotate = entry.isIntersecting && !reducedMotion && !document.hidden;
            },
            { threshold: 0.1 },
          )
        : null;
    visibilityObserver?.observe(containerRef.current);

    const handleVisibility = () => {
      if (document.hidden) autoRotate = false;
      else if (!reducedMotion) autoRotate = true;
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const handleMouseDown = (event: MouseEvent) => {
      if (!interactive) return;
      autoRotate = false;
      const startX = event.clientX;
      const startY = event.clientY;
      const startRotation: [number, number] = [...rotation];

      const handleMouseMove = (moveEvent: MouseEvent) => {
        rotation[0] = startRotation[0] + (moveEvent.clientX - startX) * 0.5;
        rotation[1] = Math.max(-90, Math.min(90, startRotation[1] - (moveEvent.clientY - startY) * 0.5));
        projection.rotate(rotation);
        render();
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        if (!reducedMotion) {
          window.setTimeout(() => {
            autoRotate = true;
          }, 800);
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    };

    const handleWheel = (event: WheelEvent) => {
      if (!interactive) return;
      event.preventDefault();
      const scaleFactor = event.deltaY > 0 ? 0.92 : 1.08;
      const next = Math.max(radius * 0.85, Math.min(radius * 1.4, projection.scale() * scaleFactor));
      projection.scale(next);
      render();
    };

    const themeObserver = new MutationObserver(() => {
      theme = readTheme();
      render();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    if (interactive) {
      canvas.addEventListener("mousedown", handleMouseDown);
      canvas.addEventListener("wheel", handleWheel, { passive: false });
    }

    void loadWorldData();

    return () => {
      rotationTimer.stop();
      themeObserver.disconnect();
      visibilityObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [width, height, highlightCountries.join(","), compact, interactive]);

  if (error) {
    return (
      <div className={`flex items-center justify-center rounded-2xl bg-muted/30 p-4 ${className}`}>
        <p className="text-center text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className="corridor-globe-glow pointer-events-none absolute inset-[-8%] rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.22),transparent_68%)]"
        aria-hidden
      />
      <canvas
        ref={canvasRef}
        className={`relative z-[1] block rounded-full shadow-[0_8px_32px_hsl(var(--primary)/0.18)] ${interactive ? "cursor-grab active:cursor-grabbing" : ""}`}
        style={{ width, height }}
        aria-label="Interactive wireframe globe showing your send corridors"
      />
      {isLoading && !compact && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-muted/20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      {interactive && !compact && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm">
          Drag to rotate
        </div>
      )}
    </div>
  );
}
