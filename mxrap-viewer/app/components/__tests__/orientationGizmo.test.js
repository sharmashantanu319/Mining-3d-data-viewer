import { describe, expect, it, vi } from "vitest";
import { renderOrientationGizmo } from "../orientationGizmo";

describe("renderOrientationGizmo", () => {
  it("renders with auto-clear off so the main scene is not wiped, then restores it", () => {
    const renderer = { autoClear: true };
    let autoClearDuringRender;
    const gizmo = {
      render: vi.fn((r) => {
        autoClearDuringRender = r.autoClear;
      }),
    };

    renderOrientationGizmo(renderer, gizmo);

    expect(gizmo.render).toHaveBeenCalledWith(renderer);
    expect(autoClearDuringRender).toBe(false);
    expect(renderer.autoClear).toBe(true);
  });

  it("leaves auto-clear off if the renderer already had it off", () => {
    const renderer = { autoClear: false };
    renderOrientationGizmo(renderer, { render: vi.fn() });
    expect(renderer.autoClear).toBe(false);
  });

  it("restores auto-clear even when the gizmo render throws", () => {
    const renderer = { autoClear: true };
    const gizmo = {
      render: () => {
        throw new Error("boom");
      },
    };

    expect(() => renderOrientationGizmo(renderer, gizmo)).toThrow("boom");
    expect(renderer.autoClear).toBe(true);
  });
});
