const BAYER8 = [
   0,32, 8,40, 2,34,10,42,
  48,16,56,24,50,18,58,26,
  12,44, 4,36,14,46, 6,38,
  60,28,52,20,62,30,54,22,
   3,35,11,43, 1,33, 9,41,
  51,19,59,27,49,17,57,25,
  15,47, 7,39,13,45, 5,37,
  63,31,55,23,61,29,53,21,
]

// Sharp dithered wave — cyan @ opacity 0.4
const CR = 0,  CG = 229, CB = 255, ALPHA = 102   // #00e5ff @ 40%
// Glow layer — same color
const GR = 0,  GG = 229, GB = 255

const GRAD_SPAN = 0.38
const WAVE_AMP  = 0.32
const SPEED     = 0.10

export function initBackground() {
  const PX = 4
  const W  = Math.round(window.innerWidth  / PX)
  const H  = Math.round(window.innerHeight / PX)

  // Wave occupies 80px at bottom of screen
  const ZONE_H = 80 / window.innerHeight

  // ── Glow canvas: smooth gradient, CSS-blurred, rendered first (behind dithered) ──
  const glowCanvas = document.createElement('canvas')
  glowCanvas.width  = W
  glowCanvas.height = H
  glowCanvas.style.cssText = [
    'position:fixed', 'top:0', 'left:0',
    'width:100vw', 'height:100vh',
    'z-index:0', 'pointer-events:none',
    'filter:blur(32px)',
  ].join(';')
  document.body.appendChild(glowCanvas)

  // ── Dithered canvas: sharp pixelated wave, rendered second (in front of glow) ──
  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  canvas.style.cssText = [
    'position:fixed', 'top:0', 'left:0',
    'width:100vw', 'height:100vh',
    'z-index:0', 'pointer-events:none',
    'image-rendering:crisp-edges',
    'image-rendering:pixelated',
  ].join(';')
  document.body.appendChild(canvas)

  const gCtx = glowCanvas.getContext('2d')
  const ctx  = canvas.getContext('2d')
  if (!ctx || !gCtx) return

  const img  = ctx.createImageData(W, H)
  const d    = img.data
  const gImg = gCtx.createImageData(W, H)
  const gd   = gImg.data
  const t0   = Date.now()

  const zoneTop = Math.floor(H * (1 - ZONE_H))

  let lastFrame = 0

  function frame(now: number) {
    requestAnimationFrame(frame)
    if (document.visibilityState === 'hidden') return
    if (now - lastFrame < 41) return   // ~24 fps
    lastFrame = now

    const t = (Date.now() - t0) * 0.001 * SPEED

    // Clear zone rows on both buffers
    for (let py = zoneTop; py < H; py++) {
      const base = py * W * 4
      const end  = base + W * 4
      for (let i = base; i < end; i++) { d[i] = 0; gd[i] = 0 }
    }

    for (let py = zoneTop; py < H; py++) {
      const yFromBottom = (1.0 - py / H) / ZONE_H

      for (let px = 0; px < W; px++) {
        const u    = (px / W - 0.5) * 5.0
        const wave = (Math.cos(2.2 * u - t) * 0.55 + Math.sin(3.7 * u + 1.15 * t) * 0.45) * WAVE_AMP

        const shape = Math.max(0, Math.min(1, 1 - (yFromBottom + wave) / GRAD_SPAN))
        const i     = (py * W + px) * 4

        // ── Sharp dithered layer ──
        if (shape > BAYER8[(py & 7) * 8 + (px & 7)] / 64) {
          d[i] = CR; d[i+1] = CG; d[i+2] = CB; d[i+3] = ALPHA
        }

        // ── Smooth glow layer (no dither — blur handles the softness) ──
        const glowA = Math.round(shape * (1 - shape) * 4 * 80)
        if (glowA > 0) {
          gd[i] = GR; gd[i+1] = GG; gd[i+2] = GB; gd[i+3] = glowA
        }
      }
    }

    ctx!.putImageData(img, 0, 0)
    gCtx!.putImageData(gImg, 0, 0)
  }

  requestAnimationFrame(frame)
}
