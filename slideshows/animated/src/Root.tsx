import { Composition } from "remotion";
import { AnimatedCarousel } from "./AnimatedCarousel";

export const Root: React.FC = () => {
  return (
    <Composition
      id="AnimatedCarousel"
      component={AnimatedCarousel}
      durationInFrames={510}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
