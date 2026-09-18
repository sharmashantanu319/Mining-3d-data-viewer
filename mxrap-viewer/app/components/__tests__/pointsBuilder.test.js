import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildPointCloud, buildPointFragmentShaderSource } from "../pointsBuilder";

describe("point symbol rendering", () => {
  it("emits a texture-sampling shader only for symbol batches", () => {
    const textured = buildPointFragmentShaderSource({ hasTexture: true });
    const circular = buildPointFragmentShaderSource({ hasTexture: false });
    expect(textured).toContain("uniform sampler2D pointTexture");
    expect(textured).toContain("texture2D(pointTexture, gl_PointCoord)");
    expect(textured).toContain("texel.a < 0.05");
    expect(circular).not.toContain("sampler2D");
    expect(circular).toContain("length(coord) > 0.5");
  });

  it("shows the symbol texture's own colour, never tinted by the colour marker", () => {
    // Client decision: symbol colour must reflect the data file regardless
    // of the active colour marker, so the fragment shader must not multiply
    // texel.rgb by vColor.
    const textured = buildPointFragmentShaderSource({ hasTexture: true });
    expect(textured).toContain("gl_FragColor = vec4(texel.rgb, texel.a)");
    expect(textured).not.toContain("vColor * texel");
  });

  it("disables vertex-colour tinting on the PointsMaterial fallback when a symbol texture is present", () => {
    const texture = new THREE.Texture();
    const cloud = buildPointCloud(
      {
        points: [{ x: 1, y: 2, z: 3 }],
      },
      {
        colorFn: () => ({ r: 1, g: 0, b: 0 }),
        pointTexture: texture,
      }
    );
    expect(cloud.material).toBeInstanceOf(THREE.PointsMaterial);
    expect(cloud.material.vertexColors).toBe(false);
    expect(cloud.material.color.getHex()).toBe(0xffffff);
    cloud.geometry.dispose();
    cloud.material.dispose();
    texture.dispose();
  });

  it("keeps source row indices aligned with filtered point attributes", () => {
    const texture = new THREE.Texture();
    const cloud = buildPointCloud(
      {
        points: [
          { x: 1, y: 2, z: 3, value: 10, sourceIndex: 7 },
          { x: 4, y: 5, z: 6, value: 20, sourceIndex: 12 },
        ],
      },
      {
        colorFn: (point) => ({ r: point.value / 20, g: 0, b: 0 }),
        sizeFn: (point) => point.value,
        minPointSize: 1,
        maxPointSize: 30,
        pointTexture: texture,
      }
    );
    expect(cloud.geometry.userData.sourceIndices).toEqual([7, 12]);
    expect(Array.from(cloud.geometry.getAttribute("position").array)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(cloud.material.uniforms.pointTexture.value).toBe(texture);
    expect(cloud.material.transparent).toBe(true);
    cloud.geometry.dispose();
    cloud.material.dispose();
    texture.dispose();
  });
});
