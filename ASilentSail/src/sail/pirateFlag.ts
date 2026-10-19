import { CanvasTexture, DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, Texture, UnsignedByteType } from "three";

export function createPirateFlagTexture(): Texture {
  const w = 512;
  const h = 320;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      paintPirateFlag(ctx, w, h);
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      return tex;
    }
  }
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 82;
    data[i * 4 + 1] = 22;
    data[i * 4 + 2] = 130;
    data[i * 4 + 3] = 255;
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const FIELD = "#6a22a8";
const FIELD_DARK = "#3d0e68";
const INK = "#050505";

function paintPirateFlag(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const field = ctx.createLinearGradient(0, 0, 0, h);
  field.addColorStop(0, "#7a2ec0");
  field.addColorStop(0.5, FIELD);
  field.addColorStop(1, FIELD_DARK);
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#1a0528";
  ctx.lineWidth = 16;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.strokeStyle = "#c48cff";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, w - 40, h - 40);

  ctx.save();
  ctx.translate(w * 0.5, h * 0.5);
  ctx.scale(h / 300, h / 300);
  drawCrossbones(ctx);
  drawSkull(ctx);
  ctx.restore();
}

function drawCrossbones(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(0, 86);
  bone(ctx, 0.72);
  bone(ctx, -0.72);
  ctx.restore();
}

function bone(ctx: CanvasRenderingContext2D, rot: number): void {
  ctx.save();
  ctx.rotate(rot);
  ctx.fillStyle = INK;
  rounded(ctx, -108, -11, 216, 22, 9);
  ctx.fill();
  knob(ctx, -112, -14);
  knob(ctx, -112, 14);
  knob(ctx, 112, -14);
  knob(ctx, 112, 14);
  ctx.restore();
}

function knob(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, 13, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawSkull(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(0, -22, 78, 84, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-50, 24);
  ctx.quadraticCurveTo(-56, 82, -30, 98);
  ctx.lineTo(30, 98);
  ctx.quadraticCurveTo(56, 82, 50, 24);
  ctx.closePath();
  ctx.fill();

  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.ellipse(-30, -10, 20, 24, 0.2, 0, Math.PI * 2);
  ctx.ellipse(30, -10, 20, 24, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(-13, 40);
  ctx.quadraticCurveTo(0, 50, 13, 40);
  ctx.closePath();
  ctx.fill();
  for (let i = -3; i <= 3; i++) {
    ctx.fillRect(i * 10 - 2.6, 62, 5.2, 22);
  }
  ctx.globalCompositeOperation = "source-over";

  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(-30, -10, 20, 24, 0.2, 0, Math.PI * 2);
  ctx.ellipse(30, -10, 20, 24, -0.2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.fillRect(-36, 56, 72, 7);
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
