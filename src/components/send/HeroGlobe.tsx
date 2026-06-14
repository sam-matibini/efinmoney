import { Player } from "@remotion/player";
import { MoneyGlobe, HERO_DURATION, HERO_W, HERO_H } from "@/remotion/MoneyGlobe";

/**
 * Responsive looping hero banner for the International send tab.
 */
const HeroGlobe = () => (
  <div className="relative w-full overflow-hidden rounded-2xl border border-border/60 shadow-sm">
    <Player
      component={MoneyGlobe}
      durationInFrames={HERO_DURATION}
      compositionWidth={HERO_W}
      compositionHeight={HERO_H}
      fps={30}
      loop
      autoPlay
      controls={false}
      doubleClickToFullscreen={false}
      clickToPlay={false}
      style={{ width: "100%", aspectRatio: `${HERO_W} / ${HERO_H}` }}
    />
  </div>
);

export default HeroGlobe;
