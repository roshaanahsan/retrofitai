import { DitheringShader } from './dithering-shader';

export default function BackgroundGradient() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const h = typeof window !== 'undefined' ? window.innerHeight : 1080;

  return (
    <DitheringShader
      width={w}
      height={h}
      shape="wave"
      type="8x8"
      colorBack="#0f1117"
      colorFront="#ff0088"
      pxSize={3}
      speed={0.5}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
