# Requirements status

This table lists every requirement the team received for the Mining 3D Data Viewer and what was
delivered against it, as of the handover on 22 October 2026 (`main`, PR #143). It covers:

1. the MVP agreed with the client on 13 August 2026 ([Business Requirements Analysis](Business_Requirements_Analysis_Group12_.pdf), sections 2.3–2.5);
2. the export format the client described by email (4 August and 18 August 2026, with the sample exports);
3. the requests the client made later, by email on 22 September and in the meetings on 25 September,
   20 October (final check-in) and 22 October (handover).

Status: **Done** works as described; **Partly done** works with the gap stated; **Not done** is not in
the viewer; **Out of scope** was agreed with the client as outside this project. Evidence names the
pull request (PR) or the source module that implements the item.

## 1. MVP agreed on 13 August 2026

### Success criteria (section 2.3)

| Requirement | Status | Evidence |
| --- | --- | --- |
| A user can open a valid local export file | Done | **Open Export**; PR #12, #26 |
| The file is processed inside the browser | Done | `validateExportFile.js`, `parseExportFile.js` (JSZip and Papa Parse in the browser) |
| The main 3D geometry and point data are displayed | Done | `geometryBuilder.js`, `pointsBuilder.js`; PR #85 |
| The user can rotate, zoom and pan the model | Done | `cameraControls.js`; PR #11, #135 |
| The user can toggle data series | Done | **Layers**; checked again at the 20 October check-in |
| The user can switch between scenes | Done | PR #110, #137 |
| Mining data is not uploaded to an external application server | Done | No backend; the app makes no network request with export data |

### MVP deliverables (section 2.4)

| Deliverable | Status | Evidence |
| --- | --- | --- |
| Import and validation of an mXrap export file | Done | Import report lists skipped rows and notes; the client's October exports load with no errors (PR #132) |
| Rendering of points, surfaces, markers and annotations | Done | PR #85, #87, #88, #93 |
| Camera navigation: rotate, zoom, tilt and pan | Done | Plus Fit, Reset, Top/Front/Side views and a perspective/orthographic switch (PR #135) |
| Scene switching | Done | Each scene keeps its own camera, projection, layers, filters and styles (PR #137) |
| Data-series filtering | Done | Layer toggles and filter cards with sliders (PR #135, #139) |
| Client-side processing with no data upload | Done | See success criteria |

### Feature prioritisation (section 2.5)

| Feature | Priority | Status | Notes |
| --- | --- | --- | --- |
| Web-based application | High / high | Done | Next.js app; can also be built as a static website (README, PR #142) |
| Local file import | High / high | Done | |
| Client-side file processing | High / high | Done | |
| Interactive 3D visualisation | High / high | Done | |
| Point and sprite visualisation | High / high | Done | Symbol images from the export, shown in their own colours (PR #51) |
| Camera rotation, zoom and pan | High / high | Done | |
| Scene switching | High / high | Done | |
| Display annotations | High / high | Done | |
| Marker styles rendering | High / high | Done | See section 2 |
| Data filters | High / high | Done | |
| Time-based data visualisation | High / low | Done | Colour by date; date filters with a time slider to the minute (PR #139) |
| Charts and dashboards | High / low | Partly done | Charts done (Magnitude-Time and the client's response charts, PR #116, #119, #138, #141, #142). One display is shown at a time: a slide's 3D views and charts are opened one by one from the **3D View** / **Chart** tabs, not laid out side by side as a dashboard |
| Large file rendering | High / low | Partly done | Tested up to the client's 20.4 MB TestResponseViewer export (92.8 MB uncompressed). Compressed size is capped at 100 MB by default (PR #131); the whole export is held in memory, with no streaming |
| Adding new scenes | Low | Not done | Low impact in the agreed prioritisation |
| Creating and editing annotations | Low | Partly done | Labels can be shown or hidden and their font, size and colours changed; new annotations cannot be added and the text cannot be edited |
| Saving or exporting a modified file | Low | Not done | Viewer settings are remembered per file in the browser (`viewerSession.js`), but no modified export is written. Image snapshots are in open PR #121 |
| mXrap exporter, API or plugins; server-side rendering; user authentication; modifying the original export; third-party integration | — | Out of scope | Agreed as out of scope for the MVP |

## 2. Export format described by the client (emails of 4 and 18 August 2026)

### Markers and colour ramps

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Number and date inputs; linear and logarithmic (log-10) scales | Done | `colourMapping.js`, `sizeMapping.js` |
| Minimum and maximum cap the input range | Done | `colourMapping.js` |
| Ramp rows with "Up to", start/end colours, "Number of Colours", start/end transparency | Done | `colourMapping.js` |
| Colour ramps "none" and "linear" (the client's priority) and "s-curve", "sqrt" | Done | `colourMapping.js` |
| Interpolation in HSV, HSV (Left To Right), HSV (Right To Left) and RGB | Done | `colourMapping.js` |
| Interpolation in CIE spaces (CIELAB, CIELCH, CIELUV, CIELCHuv) and colours given in XYZ or CIE spaces | Not done | A marker that uses one is treated as invalid and its points are drawn in a fallback colour (magenta). The client listed CIELCHuv as nice to have; see section 4 |
| `thresholdsArePercentages`, `midpoint`, `balanceMinimumAndMaximum` | Done | `colourMapping.js` |
| `nullColour` and `nullSymbol` for empty values | Done | `colourMapping.js`, `pointMarkerResolver.js` |
| Symbol images as point sprites; black made transparent in images without alpha | Done | `ThreeScene.jsx`, `markerSymbols.js` |
| Symbol images keep their own colours instead of being tinted by the colour marker (client decision) | Done | PR #51 |
| Shared marker lists (`markerMenu`, `marker-defs`) and single-colour markers such as "Cross/Grey" | Done | `markerValidation.js`, PR #132 |

### Legends

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Legend with series name and marker title next to the 3D view | Done | Right panel, `colourLegend.js` |
| Categorical legends (`categories`) | Done | `colourLegend.js` |
| `numberDisplay` "fixedDecimal" and "automaticExponential" | Done | `colourLegend.js` |
| `numberDisplay` "exponential" | Done | `colourLegend.js` |
| Date legends with the export's `format` (for example `yyyy-MM-dd`) | Done | mXrap's date format letters, including two-line formats such as the sample's `yyyy-MM-dd` / `hh:mm ap` (`colourLegend.js`) |
| User can toggle legends after opening | Done | **Marker Style → Show legend** for each 3D point series, starting from the export's `legend` setting and kept per scene. Chart series' legends follow their **Points** / **Lines** check boxes |

### Point series

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| `visible`, with the user able to toggle series | Done | **Layers** |
| `colourMarker`, switchable by the user | Done | **Marker Style → Colour by** |
| `showNullColours`, switchable by the user | Done | **Show points with no value** |
| `sizeMarker`, `sizeMinimum`, `sizeMaximum`, `nullSizes` | Done | **Size by**, **Min size**, **Max size**, **Invert size** (PR #103) |
| `distanceAttenuation` "cartoon", "real", "fixed", including the parallel (orthographic) scale | Done | `pointSizing.js`, `pointsBuilder.js` (custom shader) |
| `clipping` | Not done | Read from the export only; the client called clipping a possible extension |

### Text, annotations and lines

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Text series: 3D text facing the camera, fixed orientation from Dip, Dip Direction and Rake, and 2D text (`render2d`) | Done | `annotationsBuilder.js` |
| 3D annotation at an XYZ location with a colour and text | Done | Drawn beside the location with an arrow to it, in the annotation's colour, on top of the scene (`annotationsBuilder.js`) |
| 3D lines from `LineID` / `VertexID`, coloured per vertex | Done | `lineSeriesData.js`, `linesBuilder.js`; PR #124 |
| `lineWidth` > 0 drawn as 3D tubes of that diameter | Partly done | Drawn as lines of that width in screen pixels, not as tubes in scene units |

### Presentation and data sharing

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Top-level `info.json` with slides and displays | Done | `parseExportFile.js`; slide titles are used to name repeated displays (PR #132) |
| Slide text shown to the user | Not done | Slide text is not displayed |
| Shared `data` folder; `data-additional` joins columns by `ID` | Done | `chartData.js` |
| Series `filter` column (show rows where it is 1) | Done | `chartData.js` |

### Charts

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Axes on the bottom, left, right and top; linear, logarithmic and datetime scales; fixed minimum and maximum | Done | `parseChartConfig.js`, `chartScale.js`, `ChartView.jsx` |
| Series placed with `axisX` / `axisY` columns | Done | |
| Points, lines or both; `enablePoints`, `enableLines`, `pointsVisible`, `linesVisible` | Done | **Points** / **Lines** check boxes |
| `linePlotOrder` and `linesGroupBy` | Done | `chartData.js` |
| `lineOverrideColour` | Done | `chartColours.js` |
| Chart annotations placed on axis coordinates | Done | `ChartView.jsx` |

## 3. Later requests from the client

| Request | Source | Status | Evidence |
| --- | --- | --- | --- |
| Each scene independent, starting from the settings in its export | 22 Sep email | Done | PR #137 |
| The export decides which 3D views and charts appear (chart-only exports) | 22 Sep email | Done | PR #138 |
| Step through time with a slider within one slide | 22 Sep email | Done | PR #139 |
| Legend-based colouring of seismic event markers | 25 Sep meeting | Done | PR #87 |
| Minimum and maximum marker size, with inversion | 25 Sep meeting | Done | PR #103 |
| XYZ orientation indicator in the bottom-left corner | 25 Sep meeting | Done | PR #108, #135 |
| Complete scene transitions and camera state | 25 Sep meeting | Done | PR #110 |
| Magnitude-Time chart (multiple and logarithmic axes, point/line toggles) | 25 Sep meeting | Done | PR #116, #119 |
| Grid in axis-aligned orthographic views (nice-to-have) | 25 Sep meeting | Done | PR #137 |
| Chart axes rescale when series are toggled (nice-to-have) | 25 Sep meeting | Done | PR #138, #140 |
| Load the October exports TestResponseViewer and TestHazards | Oct exports | Done | PR #132 |
| Colour chart points by a field such as Trigger ID (first priority) | 20 Oct check-in | Done | PR #141 |
| Colour surfaces, as Marker Style does for points (second priority) | 20 Oct check-in | Done | PR #141 |
| Show only the controls of the open view (3D view or chart) | 20 Oct check-in | Done | PR #141 |
| Turn individual layers on and off | 20 Oct check-in | Done | Existing feature; checked |
| Can the viewer be hosted as a static website? | 20 Oct check-in | Done | Steps in [mxrap-viewer/README.md](../mxrap-viewer/README.md#static-website) (PR #142) |
| Hover and click details for chart points, as in the 3D view | 20 Oct check-in; raised again 22 Oct | Done | PR #142 |

## 4. Not done or partly done: suggested next steps

In priority order:

1. **Very large exports.** Load scenes one at a time or stream the CSVs, so memory use no longer
   grows with the whole export. The client indicated real exports can be very large.
2. **CIELCHuv interpolation** (and the other CIE spaces). Add them to `COLOUR_SPACES` in
   `colourMapping.js`; the client offered reference formulae. Until then such markers fall back to
   magenta.
3. **Dashboard layout.** Show a slide's displays side by side, with the slide text.
4. **Lines as tubes.** Draw lines with `lineWidth` > 0 as 3D tubes of that diameter, checking
   the frame rate with the client's response-volume exports, which have many lines.
5. **Clipping, snapshots and drag-and-drop import.** Clipping is described in the export; snapshots
   and drag-and-drop import are in open PRs #121 and #120, whose checks have not passed yet.
