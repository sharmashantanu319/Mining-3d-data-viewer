import * as THREE from "three";

export const DEFAULT_TEXT_COLOR = "#000000";
const DEFAULT_BORDER_COLOR = "#000000";
const DEFAULT_BORDER_WIDTH = 3;
const DEFAULT_FONT_WEIGHT = "600";
const DEFAULT_FONT_SIZE = "24px";
const DEFAULT_FONT_FAMILY = "Inter, system-ui, Arial, sans-serif";
const DEFAULT_FONT = `${DEFAULT_FONT_WEIGHT} ${DEFAULT_FONT_SIZE} ${DEFAULT_FONT_FAMILY}`;

// Used when an annotation has no explicit background — no card behind the
// text, just a light label with a dark outline so it reads against any
// colour in the 3D scene, matching the app's dark theme instead of a
// stark white box.
export const BARE_TEXT_COLOR = "#E7ECEA";
const BARE_TEXT_OUTLINE_COLOR = "rgba(9, 13, 11, 0.9)";
const BARE_TEXT_OUTLINE_WIDTH = 4;

const FONT_SHORTHAND_RE = /^(\S+)\s+(\d+(?:\.\d+)?px)\s+(.+)$/;

function stripMarkup(text) {
  return String(text).replace(/<[^>]*>/g, "");
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

// Splits a CSS font shorthand (as used in the export and DEFAULT_FONT) into
// its weight/size/family parts so a font-family override can swap the
// family alone without silently overriding the export's own size/weight.
function splitFont(fontString) {
  const match = FONT_SHORTHAND_RE.exec(fontString ?? "");
  if (!match) return { weight: DEFAULT_FONT_WEIGHT, size: DEFAULT_FONT_SIZE, family: DEFAULT_FONT_FAMILY };
  const [, weight, size, family] = match;
  return { weight, size, family };
}

// The font actually painted onto a label's canvas: the annotation's own
// weight/size (or the defaults), with only the family swappable via
// `fontFamilyOverride` (the viewer-wide font picker).
export function resolveLabelFont(annotation, fontFamilyOverride) {
  const { weight, size, family } = splitFont(annotation.font ?? DEFAULT_FONT);
  return `${weight} ${size} ${fontFamilyOverride ?? family}`;
}

/**
 * Precedence rules for how an annotation's own export data combines with a
 * viewer-wide `style` override ({ fontFamily, textColor, backgroundColor }),
 * pulled out as a pure function so it can be unit-tested and reused for
 * things like seeding the style panel's colour swatches with the current
 * effective default.
 */
export function resolveLabelStyle(annotation, style = {}) {
  const font = resolveLabelFont(annotation, style.fontFamily);
  // A style override of "" (cleared by the user) means "no background",
  // distinct from an override left unset (undefined), which falls back to
  // the annotation's own background.
  const backgroundColor =
    style.backgroundColor !== undefined ? style.backgroundColor || null : annotation.background ?? null;
  const hasBackground = backgroundColor != null;
  const textColor = style.textColor ?? annotation.color ?? (hasBackground ? DEFAULT_TEXT_COLOR : BARE_TEXT_COLOR);
  const borderColor = annotation.borderColor ?? (hasBackground ? DEFAULT_BORDER_COLOR : BARE_TEXT_OUTLINE_COLOR);
  const borderWidth = finiteOr(annotation.borderWidth, hasBackground ? DEFAULT_BORDER_WIDTH : BARE_TEXT_OUTLINE_WIDTH);
  const padding = finiteOr(annotation.padding, hasBackground ? 12 : BARE_TEXT_OUTLINE_WIDTH);
  const borderRadius = finiteOr(annotation.borderRadius, 8);
  return { font, hasBackground, backgroundColor, textColor, borderColor, borderWidth, padding, borderRadius };
}

function createLabelTexture(annotation, style = {}) {
  const text = stripMarkup(annotation.text ?? "");
  const { font, hasBackground, backgroundColor, textColor, borderColor, borderWidth, padding, borderRadius } =
    resolveLabelStyle(annotation, style);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  context.font = font;
  const textWidth = Math.ceil(context.measureText(text).width);
  canvas.width = Math.max(1, textWidth + padding * 2);
  canvas.height = Math.max(1, 32 + padding * 2);

  context.font = font;
  context.textBaseline = "middle";

  if (hasBackground) {
    context.fillStyle = backgroundColor;
    context.beginPath();
    context.roundRect(0, 0, canvas.width, canvas.height, borderRadius);
    context.fill();

    context.strokeStyle = borderColor;
    context.lineWidth = borderWidth;
    context.stroke();

    context.fillStyle = textColor;
    context.fillText(text, padding, canvas.height / 2);
  } else {
    context.lineJoin = "round";
    context.miterLimit = 2;
    context.strokeStyle = borderColor;
    context.lineWidth = borderWidth;
    context.strokeText(text, padding, canvas.height / 2);

    context.fillStyle = textColor;
    context.fillText(text, padding, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return { texture, width: canvas.width, height: canvas.height };
}

/**
 * Build a text annotation from a serialisable annotation object.
 *
 * 2D labels and 3D face-camera labels use sprites. Fixed-orientation 3D text
 * uses a plane whose local XY orientation matches the customer's convention:
 * it starts flat on XY, with the front facing +Z and the text top toward +Y.
 *
 * `style` carries viewer-wide appearance overrides (fontFamily, textColor,
 * backgroundColor) set by the user via the Annotations panel; any left
 * unset fall back to the annotation's own values from the export.
 */
export function buildAnnotation(annotation, style = {}) {
  const { texture, width, height } = createLabelTexture(annotation, style);
  const scale = finiteOr(annotation.scale, 10);
  const isOverlay = annotation.render2d === true;
  const faceCamera = annotation.faceCamera === true;
  const materialOptions = {
    map: texture,
    transparent: true,
    depthTest: !isOverlay && annotation.depthTest !== false,
    depthWrite: false,
    side: THREE.DoubleSide,
  };

  let object;
  if (isOverlay || faceCamera) {
    // THREE.Sprite's geometry is always a unit square, so — unlike the
    // PlaneGeometry(width, height) branch below, which bakes the label's
    // real pixel aspect ratio into its geometry — its scale must be set
    // per-axis to match. A uniform multiplyScalar(scale) here would
    // squash/stretch the label's text to fit a square, distorting it.
    object = new THREE.Sprite(new THREE.SpriteMaterial(materialOptions));
    // Stashed for ThreeScene.jsx's annotation-size control, which re-applies
    // scale on its own (see the annotationsVisible/annotationScale effect)
    // and needs this to stay aspect-aware too, not just the initial value set
    // here.
    object.userData.aspectRatio = width / height;
    object.scale.set((width / height) * scale, scale, 1);
  } else {
    object = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial(materialOptions));
    // Three.js applies these local rotations in the same sequence as the
    // export convention: Rake, then Dip, then Dip Direction.
    object.rotateZ(THREE.MathUtils.degToRad(finiteOr(annotation.rake, 0)));
    object.rotateX(THREE.MathUtils.degToRad(finiteOr(annotation.dip, 0)));
    object.rotateZ(THREE.MathUtils.degToRad(finiteOr(annotation.dipDirection, 0)));
    object.scale.multiplyScalar(scale);
  }
  object.position.set(
    finiteOr(annotation.x, 0),
    finiteOr(annotation.y, 0),
    finiteOr(annotation.z, 0)
  );
  object.userData.annotation = annotation;
  return object;
}

export function disposeAnnotation(sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
  // Sprite geometry is a single shared unit-square instance reused across
  // all THREE.Sprite objects, so disposing it here would break every other
  // sprite label still in use. The PlaneGeometry used for fixed-orientation
  // labels is per-instance and must be disposed.
  if (!(sprite instanceof THREE.Sprite)) {
    sprite.geometry?.dispose();
  }
}