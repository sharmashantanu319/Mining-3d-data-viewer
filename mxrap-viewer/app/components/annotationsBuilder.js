import * as THREE from "three";

const DEFAULT_TEXT_COLOR = "#000000";
const DEFAULT_BORDER_COLOR = "#000000";
const DEFAULT_BORDER_WIDTH = 3;
const DEFAULT_FONT = "600 24px Inter, system-ui, Arial, sans-serif";

// Used when an annotation has no explicit background — no card behind the
// text, just a light label with a dark outline so it reads against any
// colour in the 3D scene, matching the app's dark theme instead of a
// stark white box.
const BARE_TEXT_COLOR = "#E7ECEA";
const BARE_TEXT_OUTLINE_COLOR = "rgba(9, 13, 11, 0.9)";
const BARE_TEXT_OUTLINE_WIDTH = 4;

function stripMarkup(text) {
  return String(text).replace(/<[^>]*>/g, "");
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function createLabelTexture(annotation, style = {}) {
  const text = stripMarkup(annotation.text ?? "");
  const font = style.font ?? annotation.font ?? DEFAULT_FONT;
  // A style override of "" (cleared by the user) means "no background",
  // distinct from an override left unset (undefined), which falls back to
  // the annotation's own background.
  const background = style.backgroundColor !== undefined ? style.backgroundColor || null : annotation.background;
  const hasBackground = background != null;
  const padding = finiteOr(annotation.padding, hasBackground ? 12 : BARE_TEXT_OUTLINE_WIDTH);
  const borderRadius = finiteOr(annotation.borderRadius, 8);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  context.font = font;
  const textWidth = Math.ceil(context.measureText(text).width);
  canvas.width = Math.max(1, textWidth + padding * 2);
  canvas.height = Math.max(1, 32 + padding * 2);

  context.font = font;
  context.textBaseline = "middle";

  if (hasBackground) {
    context.fillStyle = background;
    context.beginPath();
    context.roundRect(0, 0, canvas.width, canvas.height, borderRadius);
    context.fill();

    context.strokeStyle = annotation.borderColor ?? DEFAULT_BORDER_COLOR;
    context.lineWidth = finiteOr(annotation.borderWidth, DEFAULT_BORDER_WIDTH);
    context.stroke();

    context.fillStyle = style.textColor ?? annotation.color ?? DEFAULT_TEXT_COLOR;
    context.fillText(text, padding, canvas.height / 2);
  } else {
    context.lineJoin = "round";
    context.miterLimit = 2;
    context.strokeStyle = annotation.borderColor ?? BARE_TEXT_OUTLINE_COLOR;
    context.lineWidth = finiteOr(annotation.borderWidth, BARE_TEXT_OUTLINE_WIDTH);
    context.strokeText(text, padding, canvas.height / 2);

    context.fillStyle = style.textColor ?? annotation.color ?? BARE_TEXT_COLOR;
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
 * `style` carries viewer-wide appearance overrides (font, textColor,
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
}