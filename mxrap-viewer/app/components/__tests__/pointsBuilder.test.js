import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildPointCloud, buildPointFragmentShaderSource } from "../pointsBuilder";

// Shader source is formatted across multiple lines, so compare it with all
// whitespace removed to keep the assertions independent of code formatting.
const compact = (source) => source.replace(/\s+/g, "");

describe("point symbol rendering", () => {
  it.each([0.5, 1, 1.5])("scales display size by %s without changing exported marker sizes", (scale) => {
    const cloud = buildPointCloud({ points: [{ x: 1, y: 2, z: 3 }] }, {
      sizeFn: () => 35, minPointSize: 20, maxPointSize: 50,
      distanceAttenuation: "cartoon", markerDisplayScale: scale,
    });
    expect(cloud.geometry.attributes.pointSize.getX(0)).toBe(35);
    expect(cloud.material.uniforms.markerDisplayScale.value).toBe(scale);
    cloud.geometry.dispose();
    cloud.material.dispose();
  });

  it("emits a texture-sampling shader only for symbol batches", () => {
    const textured = compact(buildPointFragmentShaderSource({ hasTexture: true }));
    const circular = compact(buildPointFragmentShaderSource({ hasTexture: false }));
    expect(textured).toContain("uniformsampler2DpointTexture");
    expect(textured).toContain("texture2D(pointTexture,gl_PointCoord)");
    expect(textured).toContain("texel.a<0.05");
    expect(circular).not.toContain("sampler2D");
    expect(circular).toContain("length(coord)>0.5");
  });

  it("shows the symbol texture's own colour by default, never tinted by the colour marker", () => {
    // Client decision: symbol colour must reflect the data file regardless
    // of the active colour marker, so by default the fragment shader must not
    // multiply texel.rgb by vColor.
    const textured = compact(buildPointFragmentShaderSource({ hasTexture: true }));
    expect(textured).toContain("gl_FragColor=vec4(texel.rgb,texel.a)");
    expect(textured).not.toContain("texel.rgb*vColor");
  });

  it("only multiplies the symbol texture by the vertex colour when tinting is requested", () => {
    const tinted = compact(
      buildPointFragmentShaderSource({ hasTexture: true, tintTextureWithVertexColor: true })
    );
    const untinted = compact(
      buildPointFragmentShaderSource({ hasTexture: true, tintTextureWithVertexColor: false })
    );
    expect(tinted).toContain("gl_FragColor=vec4(texel.rgb*vColor,texel.a)");
    expect(untinted).toContain("gl_FragColor=vec4(texel.rgb,texel.a)");
    expect(untinted).not.toContain("texel.rgb*vColor");
  });

  it("colours procedural shaded spheres from the vertex colour and never samples a texture", () => {
    const sphere = compact(
      buildPointFragmentShaderSource({ hasTexture: false, renderAsShadedSphere: true })
    );
    expect(sphere).not.toContain("sampler2D");
    expect(sphere).toContain("vColor*lighting");
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
    expect(cloud.geometry.userData.points.map((point) => point.value)).toEqual([10, 20]);
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
