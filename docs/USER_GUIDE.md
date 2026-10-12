# Mining 3D Data Viewer: user guide

This guide is for geotechnical engineers and report recipients who want to explore an mXrap
export in a web browser. You do not need mXrap or a licence. Your data never leaves your
computer: the viewer reads the export file inside the browser and uploads nothing.

To install and start the viewer, see the [quick start](../README.md#quick-start).

## 1. Open an export

1. Click **Open Export** in the top-right corner.
2. Choose an mXrap export `.zip` (for a first try, use
   `mxrap-viewer/test-data/visualiser-export-2.zip`).
3. While the file loads, the button reads **Loading…** and the status bar shows **Loading**.
   When it shows **Ready**, the first scene is displayed and the file and scene names appear in
   the header.

Until you open a file, the viewer shows built-in demo data ("Demo data" in the header).

**Import report.** Below the header, the collapsible **Import report** lists every data series
with the number of records loaded and skipped, plus any warnings (for example rows with
missing coordinates or references to data that is not in the export). Rows that fail validation
are skipped, not drawn incorrectly. If the export cannot be read at all, the status bar turns red
and shows the error.

## 2. Move around the 3D view

| Action | Mouse |
| --- | --- |
| Rotate | Left-drag |
| Pan | Right-drag |
| Zoom | Scroll wheel |

The toolbar in the top-left corner of the view has:

- **Fit Scene**: frame all currently visible data.
- **Reset View**: return to the camera position saved in the export.
- **Perspective / Orthographic**: switch the projection. Orthographic is useful for plan and
  section views with no perspective distortion.

The axis indicator in the bottom-left corner shows the X, Y and Z directions at all times.

## 3. Switch scenes

An export can contain several scenes. In the left sidebar, **Scene** shows the current scene;
choose another from the drop-down or use **Prev** / **Next**. Each scene has its own
layers, legends and camera, and the viewer remembers where you left the camera in each scene.

## 4. Layers

The **Layers** section lists every data series in the scene (events, sensors, surfaces, RMQ
intervals, and so on). Click a layer to hide or show it. The status bar shows how many points
are visible out of the total, and how many surfaces are loaded.

## 5. Marker style

**Marker Style** controls how points are drawn for the selected **Series**:

- **Colour by**: colour points by an attribute (for example local magnitude); the matching
  legend appears in the right panel.
- **Size by**: scale points by an attribute. **Min size** and **Max size** set the marker size at
  the low and high ends of the range; **Invert size** makes small values draw the largest
  markers. With no attribute selected, every point uses the average of min and max.
- **Marker size** and **Symbol**: overall display size and marker shape.

These start from the settings saved in the export, so the view initially matches mXrap.

## 6. Annotations

The **Annotations** section turns text labels on or off and changes their size, font, text
colour and background colour. **Show null marker values** controls whether points with no value
for the colour attribute are drawn.

## 7. Filter data

1. Open **Filters** and pick a field from the list (type in **Search fields…** to find one).
2. Set a range (for numbers or dates) or tick the values to keep (for categories).
3. Points outside the filter are hidden immediately. Active filters are listed with a remove
   button, and the status bar shows how many filters are active.

## 8. Inspect a point

Hover over a point to preview its attributes; click to keep them in the **Selected point**
panel on the right. The status bar also shows the point ID and X, Y, Z coordinates. Click
**Clear** to deselect.

## 9. Legends

The right panel shows a legend for each coloured series: a colour ramp with tick labels for
numeric values, or a list of colours for categories. Each legend can be collapsed or expanded. The
**Collapse** button at the top of each side panel hides it to give the 3D view more space; click
the narrow strip that remains to expand it again.

## 10. Charts

If the export contains charts, **3D View** and **Chart** tabs appear at the top of the view.
Open **Chart** to see the Magnitude-Time chart (choose another chart from the drop-down if there
are several). Each series has **Points** and **Lines** check boxes to show or hide it. Axes,
colours and logarithmic scales follow the chart settings in the export.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| Nothing appears after loading | Click **Fit Scene**; check that layers are not hidden and no filter excludes everything. |
| Warnings in the import report | The listed rows were skipped; the rest of the data is still shown. Check the export in mXrap if many rows are skipped. |
| Status bar shows **Error** | The file is not a valid mXrap export `.zip`, or a required file inside it is missing. |
| The browser becomes slow or crashes on a very large export | The whole export is held in memory; try a smaller export or a computer with more RAM. |
| The 3D view is blank on every file | Make sure WebGL is enabled in your browser and graphics drivers are up to date. |

To report a bug, open an issue at
<https://github.com/sharmashantanu319/Mining-3d-data-viewer/issues>.
