import * as THREE from "three";

export const DEFAULT_TEXT_COLOR = "#000000";
const DEFAULT_BORDER_COLOR = "#000000";
const DEFAULT_BORDER_WIDTH = 3;
const DEFAULT_FONT_WEIGHT = "600";
const DEFAULT_FONT_SIZE = "24px";
const DEFAULT_FONT = `${DEFAULT_FONT_WEIGHT} ${DEFAULT_FONT_SIZE} Inter, system-ui, Arial, sans-serif`;

// Used when an annotation has no explicit background — no card behind the
// text, just a light label with a dark outline so it reads against any
// colour in the 3D scene, matching the app's dark theme instead of a
// stark white box.
export const BARE_TEXT_COLOR = "#E7ECEA";
const BARE_TEXT_OUTLINE_COLOR = "rgba(9, 13, 11, 0.9)";
const BARE_TEXT_OUTLINE_WIDTH = 4;

// Splits a CSS font shorthand at its size token: everything up to and
// including "<n>px" (plus an optional "/line-height") is the style/weight/size
// prefix, everything after is the family list. Handles "600 24px Inter",
// "italic bold 20px Arial", "20px Arial" and "bold 20px/1.2 Arial".
const FONT_SHORTHAND_RE = /^(.*?\b\d+(?:\.\d+)?px(?:\/\S+)?)\s+(.+)$/;

function stripMarkup(text) {
  return String(text).replace(/<[^>]*>/g, "");
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

// The font actually painted onto a label's canvas. Without an override the
// annotation's own font is used verbatim (so any valid CSS shorthand from the
// export survives); with a family override (the viewer-wide font picker) only
// the family is swapped, keeping the annotation's own style/weight/size.
export function resolveLabelFont(annotation, fontFamilyOverride) {
  const ownFont = annotation.font || DEFAULT_FONT;
  if (!fontFamilyOverride) return ownFont;
  const match = FONT_SHORTHAND_RE.exec(ownFont);
  const prefix = match ? match[1] : `${DEFAULT_FONT_WEIGHT} ${DEFAULT_FONT_SIZE}`;
  return `${prefix} ${fontFamilyOverride}`;
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
  // An override that is unset (undefined or null — the viewer's default
  // state) falls back to the annotation's own background; an explicit ""
  // means "no background".
  const backgroundColor =
    style.backgroundColor == null ? annotation.background ?? null : style.backgroundColor || null;
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

// Removes and disposes a list of `{ object }` annotation entries (the shape
// ThreeScene keeps in annotationsRef). Shared by the style-rebuild effect and
// the scene teardown so both release exactly the labels currently in the scene.
export function disposeAnnotations(entries, scene = null) {
  (entries ?? []).forEach(({ object }) => {
    scene?.remove(object);
    disposeAnnotation(object);
  });
}
