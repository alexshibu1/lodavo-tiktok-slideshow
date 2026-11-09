import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  Img,
} from "remotion";

const WHITE = "#FFFFFF";
const GOLD = "#FFD700";
const BLUE = "#2200b3";

const FPS = 30;
const HOOK_DUR = Math.round(2.5 * FPS);
const BEAT_DUR = Math.round(2 * FPS);
const CTA_DUR = Math.round(3 * FPS);

const PHOTOS = {
  hook: "https://images.pexels.com/photos/3483098/pexels-photo-3483098.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
  beat1: "https://images.pexels.com/photos/6120214/pexels-photo-6120214.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
  beat2: "https://images.pexels.com/photos/730547/pexels-photo-730547.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
  beat3: "https://images.pexels.com/photos/4386476/pexels-photo-4386476.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
  beat4: "https://images.pexels.com/photos/6347720/pexels-photo-6347720.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
  beat5: "https://images.pexels.com/photos/3943716/pexels-photo-3943716.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
  cta: "https://images.pexels.com/photos/1519088/pexels-photo-1519088.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
};

const FadeUp: React.FC<{
  children: React.ReactNode;
  frame: number;
  delay?: number;
  distance?: number;
}> = ({ children, frame, delay = 0, distance = 60 }) => {
  const progress = interpolate(frame - delay, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div
      style={{
        opacity: progress,
        transform: `translateY(${(1 - progress) * distance}px)`,
      }}
    >
      {children}
    </div>
  );
};

const ScaleIn: React.FC<{
  children: React.ReactNode;
  frame: number;
  fps: number;
  delay?: number;
}> = ({ children, frame, fps, delay = 0 }) => {
  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
  });
  const opacity = interpolate(frame - delay, [0, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ opacity, transform: `scale(${scale})` }}>
      {children}
    </div>
  );
};

const SlideRight: React.FC<{
  children: React.ReactNode;
  frame: number;
  delay?: number;
}> = ({ children, frame, delay = 0 }) => {
  const progress = interpolate(frame - delay, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div
      style={{
        opacity: progress,
        transform: `translateX(${(1 - progress) * 300}px)`,
      }}
    >
      {children}
    </div>
  );
};

const PhotoSlide: React.FC<{
  src: string;
  overlay?: number;
  children: React.ReactNode;
  frame: number;
}> = ({ src, overlay = 0.6, children, frame }) => {
  const zoom = interpolate(frame, [0, 90], [1.0, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill>
      <AbsoluteFill>
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${zoom})`,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, rgba(0,0,0,${overlay + 0.15}) 0%, rgba(0,0,0,${overlay - 0.1}) 50%, rgba(0,0,0,${overlay + 0.1}) 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: "100px 80px",
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const HookSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <PhotoSlide src={PHOTOS.hook} overlay={0.65} frame={frame}>
      <div style={{ textAlign: "center" }}>
        <ScaleIn frame={frame} fps={fps}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 78,
              fontWeight: 800,
              color: WHITE,
              lineHeight: 1.15,
              margin: 0,
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            nobody has won the{" "}
            <span style={{ color: GOLD, fontSize: 110 }}>$10,000</span> yet
          </p>
        </ScaleIn>
      </div>
    </PhotoSlide>
  );
};

const Beat1Slide: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <PhotoSlide src={PHOTOS.beat1} overlay={0.6} frame={frame}>
      <div style={{ textAlign: "center" }}>
        <FadeUp frame={frame} delay={0}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 72,
              fontWeight: 800,
              color: WHITE,
              margin: 0,
              lineHeight: 1.2,
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            26 weeks of draws
          </p>
        </FadeUp>
        <FadeUp frame={frame} delay={12}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 52,
              fontWeight: 600,
              color: GOLD,
              margin: "40px 0 0 0",
              lineHeight: 1.3,
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            someone wins $100
            <br />
            every week
          </p>
        </FadeUp>
      </div>
    </PhotoSlide>
  );
};

const Beat2Slide: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <PhotoSlide src={PHOTOS.beat2} overlay={0.65} frame={frame}>
      <div style={{ textAlign: "center" }}>
        <SlideRight frame={frame} delay={0}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 72,
              fontWeight: 800,
              color: WHITE,
              margin: 0,
              lineHeight: 1.2,
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            but the jackpot?
          </p>
        </SlideRight>
        <SlideRight frame={frame} delay={14}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 68,
              fontWeight: 800,
              color: GOLD,
              margin: "40px 0 0 0",
              lineHeight: 1.2,
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            still sitting there
          </p>
        </SlideRight>
      </div>
    </PhotoSlide>
  );
};

const Beat3Slide: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <PhotoSlide src={PHOTOS.beat3} overlay={0.55} frame={frame}>
      <div style={{ textAlign: "center" }}>
        <FadeUp frame={frame} delay={0}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 68,
              fontWeight: 800,
              color: WHITE,
              margin: 0,
              lineHeight: 1.2,
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            every <span style={{ color: GOLD }}>$25</span> you save
          </p>
        </FadeUp>
        <FadeUp frame={frame} delay={12}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 64,
              fontWeight: 700,
              color: WHITE,
              margin: "40px 0 0 0",
              lineHeight: 1.2,
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            earns a <span style={{ color: GOLD }}>free ticket</span>
          </p>
        </FadeUp>
      </div>
    </PhotoSlide>
  );
};

const Beat4Slide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const numbers = [12, 34, 7, 55, 88, 43, 61];

  return (
    <PhotoSlide src={PHOTOS.beat4} overlay={0.7} frame={frame}>
      <div style={{ textAlign: "center" }}>
        <FadeUp frame={frame} delay={0}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 64,
              fontWeight: 800,
              color: WHITE,
              margin: "0 0 50px 0",
              lineHeight: 1.2,
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            choose <span style={{ color: GOLD }}>7 numbers</span>
          </p>
        </FadeUp>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 16,
            flexWrap: "wrap",
            maxWidth: 900,
            margin: "0 auto 50px auto",
          }}
        >
          {numbers.map((n, i) => {
            const popDelay = 10 + i * 4;
            const scale = spring({
              frame: frame - popDelay,
              fps,
              config: { damping: 10, stiffness: 200, mass: 0.6 },
            });
            const opacity = interpolate(frame - popDelay, [0, 4], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={i}
                style={{
                  width: 110,
                  height: 110,
                  borderRadius: "50%",
                  backgroundColor: "rgba(34,0,179,0.7)",
                  border: `3px solid ${GOLD}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity,
                  transform: `scale(${scale})`,
                  backdropFilter: "blur(8px)",
                }}
              >
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: 44,
                    fontWeight: 800,
                    color: GOLD,
                  }}
                >
                  {n}
                </span>
              </div>
            );
          })}
        </div>
        <FadeUp frame={frame} delay={40}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 56,
              fontWeight: 700,
              color: WHITE,
              margin: 0,
              lineHeight: 1.2,
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            match all 7 to win
          </p>
        </FadeUp>
      </div>
    </PhotoSlide>
  );
};

const Beat5Slide: React.FC = () => {
  const frame = useCurrentFrame();
  const count = Math.round(
    interpolate(frame, [0, 20], [0, 40], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    })
  );
  const dollars = Math.round(
    interpolate(frame, [0, 20], [0, 1000], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    })
  );

  return (
    <PhotoSlide src={PHOTOS.beat5} overlay={0.6} frame={frame}>
      <div style={{ textAlign: "center" }}>
        <FadeUp frame={frame} delay={0}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 88,
              fontWeight: 800,
              color: GOLD,
              margin: "0 0 20px 0",
              lineHeight: 1.1,
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            ${dollars.toLocaleString()}
          </p>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 48,
              fontWeight: 600,
              color: WHITE,
              margin: "0 0 60px 0",
              lineHeight: 1.3,
              opacity: 0.8,
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            saved
          </p>
        </FadeUp>
        <FadeUp frame={frame} delay={8}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 110,
              fontWeight: 900,
              color: GOLD,
              margin: "0 0 20px 0",
              lineHeight: 1.1,
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            {count}
          </p>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 48,
              fontWeight: 600,
              color: WHITE,
              margin: 0,
              lineHeight: 1.3,
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            tickets every week
          </p>
        </FadeUp>
      </div>
    </PhotoSlide>
  );
};

const CTASlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mockupScale = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 100, mass: 0.8 },
  });
  const mockupOpacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <PhotoSlide src={PHOTOS.cta} overlay={0.7} frame={frame}>
      <div
        style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
        }}
      >
        <div style={{ opacity: mockupOpacity, transform: `scale(${mockupScale})` }}>
          <div
            style={{
              width: 320,
              height: 560,
              borderRadius: 40,
              backgroundColor: "rgba(34,0,179,0.6)",
              border: `4px solid ${GOLD}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
              boxShadow: `0 0 80px rgba(34,0,179,0.4)`,
              backdropFilter: "blur(12px)",
            }}
          >
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 36,
                fontWeight: 800,
                color: WHITE,
                margin: 0,
              }}
            >
              Lodavo
            </p>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 22,
                fontWeight: 500,
                color: GOLD,
                margin: 0,
              }}
            >
              save and win
            </p>
          </div>
        </div>
        <FadeUp frame={frame} delay={12}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 60,
              fontWeight: 800,
              color: GOLD,
              margin: 0,
              lineHeight: 1.2,
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            download Lodavo free
          </p>
        </FadeUp>
      </div>
    </PhotoSlide>
  );
};

export const AnimatedCarousel: React.FC = () => {
  const frame = useCurrentFrame();

  const slideTimings = [
    { start: 0, dur: HOOK_DUR },
    { start: HOOK_DUR, dur: BEAT_DUR },
    { start: HOOK_DUR + BEAT_DUR, dur: BEAT_DUR },
    { start: HOOK_DUR + 2 * BEAT_DUR, dur: BEAT_DUR },
    { start: HOOK_DUR + 3 * BEAT_DUR, dur: BEAT_DUR },
    { start: HOOK_DUR + 4 * BEAT_DUR, dur: BEAT_DUR },
    { start: HOOK_DUR + 5 * BEAT_DUR, dur: CTA_DUR + BEAT_DUR },
  ];

  const fadeOut = (index: number): number => {
    const { start, dur } = slideTimings[index];
    const localFrame = frame - start;
    if (index === slideTimings.length - 1) return 1;
    return interpolate(localFrame, [dur - 8, dur], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  };

  const slides = [
    HookSlide,
    Beat1Slide,
    Beat2Slide,
    Beat3Slide,
    Beat4Slide,
    Beat5Slide,
    CTASlide,
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {slides.map((SlideComponent, i) => (
        <Sequence
          key={i}
          from={slideTimings[i].start}
          durationInFrames={slideTimings[i].dur}
        >
          <AbsoluteFill style={{ opacity: fadeOut(i) }}>
            <SlideComponent />
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
