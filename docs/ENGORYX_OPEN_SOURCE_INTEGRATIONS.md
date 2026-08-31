# ENGORYX Open-Source Integrations Evaluation

This document evaluates vetted open-source libraries, tools, and frameworks for future engineering capabilities in Engoryx. Library verdicts are technical candidate assessments only; they do not mean the corresponding Engoryx feature is implemented or available. The feature registry and in-app status surface are authoritative for product availability.

Each candidate is assessed against strict production engineering criteria:
- **Capability & Fit**: Direct alignment with engineering workflows.
- **License Viability**: Permissive (MIT, Apache 2.0, BSD) or clean self-hosted service boundaries (MPL 2.0, AGPL-3.0 services).
- **Architecture & Bundle Impact**: Browser runtime efficiency, tree-shaking, lazy-loading, WebAssembly overhead.
- **Offline & Mobile Readiness**: Performance on field tablets and mobile smartphones.
- **Evaluation Verdict**: Ready for Integration, Prototype / Sandbox, Deferred / roadmap phase, or Rejected / License Encumbered.

---

## 1. Summary Evaluation Matrix

| Domain / Module | Candidate Library | License | Primary Use Case | Verdict | Key Advantage / Trade-off |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Drawings & Blueprints** | **Mozilla PDF.js** | Apache-2.0 | Vector PDF rendering & viewport tiling | **Ready for Integration** | Rock-solid canvas rendering; requires custom tiling for large D/E-size sheets. |
| **Drawing Annotations** | **Konva.js / React-Konva** | MIT | Layered 2D redlining, callouts, clouds, measurements | **Ready for Integration** | High-performance 60fps canvas manipulation; clear coordinate transform model. |
| **3D CAD Viewer** | **Online3DViewer** | MIT | STEP, IGES, OBJ, STL, GLTF 3D model rendering | **Ready for Integration** | Clean pure JavaScript/Three.js engine; zero external backend required. |
| **BIM Model Viewer** | **web-ifc (IFC.js)** | MPL-2.0 | Building Information Model (IFC) parsing & geometry | **Prototype / Sandbox** | Fast WebAssembly parser; requires memory-conscious chunking on mobile. |
| **Gantt & Scheduling** | **Frappe Gantt** | MIT | Interactive project Gantt charts & dependencies | **Deferred / Phase 2 (frozen)** | Ultra-lightweight (<30KB), SVG-based, easy React wrapper, responsive; no current product integration. |
| **Barcode & QR Capture** | **ZXing-js / @zxing/browser** | Apache-2.0 | Camera-based asset & material tracking | **Ready for Integration** | Direct web camera stream processing; excellent barcode format support. |
| **GIS & Site Mapping** | **MapLibre GL JS** | BSD-3-Clause | Vector map rendering & satellite imagery overlay | **Ready for Integration** | Community fork of Mapbox GL; WebGL performance without vendor lock-in. |
| **Spatial Analysis** | **Turf.js** | MIT | Geospatial polygon calculations, distance, cut/fill | **Ready for Integration** | Modular GeoJSON operations; runs seamlessly on client and server. |
| **Diagrams & Sketching** | **Excalidraw** | MIT | Hand-drawn site sketches & technical diagrams | **Prototype / Sandbox** | Delightful user experience; bundle size requires lazy-loaded route chunk. |
| **Digital Signatures** | **Documenso** | AGPL-3.0 | Self-hosted contract & lien waiver signing | **Prototype / Sandbox** | Modern e-signature API; must be hosted as standalone microservice. |
| **Drone Photogrammetry**| **OpenDroneMap (ODM)** | GPL-3.0 | Drone survey image stitching to GeoTIFF | **Deferred / Phase 4+**| Powerful backend processing pipeline; requires GPU/CPU worker cluster. |
| **Document Intelligence**| **Docling (IBM/DS4SD)** | MIT | Complex table extraction & drawing title-block OCR | **Deferred / Phase 7+**| State-of-the-art layout analysis; best deployed as Python backend service. |
| **Field SMS Gateway** | **httpSMS** | MIT / SaaS | Direct Android SMS dispatch for worker notifications| **Ready for Integration** | Turns standard Android device with SIM into reliable SMS field gateway. |

---

## 2. Detailed Technical Evaluations

### 2.1 Drawings & Spec Sheets: Mozilla PDF.js & Konva.js
- **Target Capability**: Viewing multi-megabyte 24 x36 (Arch D) architectural and structural drawings with instant zooming, panning, layered annotations, cloud markups, and dimension measurements.
- **Recommended Stack**: pdfjs-dist (Apache-2.0) + konva / eact-konva (MIT).
- **Architecture**:
  - PDF.js renders the base drawing sheet to an HTML5 canvas at the current viewport resolution using an off-screen render queue.
  - A synchronized Konva.Stage sits directly on top of the PDF canvas to manage vector annotation objects (rectangles, callout clouds, arrow dimensions, text notes, stamps).
  - Annotations are serialized as GeoJSON-like coordinate vectors normalized to $[0, 1]$ relative to drawing page dimensions, ensuring annotations remain pixel-perfect across all zoom levels and display scales.
- **Mobile/Offline Readiness**: High. Drawing files and serialized annotation JSON can be cached locally via IndexedDB.
- **Performance**: Cap viewport rendering to \times$ device pixel ratio; implement debounced redraw during rapid gesture zooming.
- **Verdict**: **Ready for Integration (Phase 1)**.

### 2.2 Project Scheduling & Gantt: Frappe Gantt
- **Target Capability**: Interactive visual project timelines, task dependencies, critical path highlighting, and milestone progress tracking.
- **Recommended Library**: frappe-gantt (MIT) with a lightweight TypeScript/React wrapper.
- **Architecture**:
  - Pure SVG rendering ensures crisp lines on high-DPI displays.
  - Native support for custom popups, drag-to-resize, and progress updates.
  - If Phase 2 is activated, the adapter must use canonical Engoryx schedule records and validated project relationships.
- **Bundle Size**: Under 25 KB gzipped.
- **Verdict**: **Deferred / Phase 2 (core-hardening freeze)**. No production schedule route, persistence, RLS, or workspace UI exists yet.

### 2.3 Field Barcode & QR Code Capture: ZXing-js
- **Target Capability**: Scanning QR codes and 1D barcodes on material crates, tool tags, equipment badges, and delivery packing slips using device cameras.
- **Recommended Library**: @zxing/browser and @zxing/library (Apache-2.0).
- **Architecture**:
  - Accesses camera via standard HTML5 MediaDevices.getUserMedia().
  - Performs continuous frame scanning in a requestAnimationFrame loop with automatic camera selection (environment/back camera preference).
  - Emits decoded string payloads to material requisition matchers and tool check-out handlers.
- **Offline Readiness**: 100% client-side; zero network dependency during scanning.
- **Verdict**: **Ready for Integration (Phase 3)**.

### 2.4 3D CAD & BIM Model Visualization: Online3DViewer & web-ifc
- **Target Capability**: Interactive browser inspection of 3D CAD files (STEP, IGES, OBJ, STL, GLTF) and Building Information Models (IFC).
- **Recommended Libraries**:
  - online-3d-viewer (MIT) for general CAD models.
  - web-ifc (MPL-2.0, That Open Company / IFC.js) for structured IFC BIM files.
- **Architecture**:
  - Dynamic WebGL canvas powered by Three.js.
  - WebAssembly (Wasm) worker for streaming IFC geometry extraction without blocking the UI thread.
  - Enables element isolation (e.g. show structural framing only, hide MEP).
- **Bundle Strategy**: Must be isolated into a dynamic import() chunk loaded only when opening the 3D model tab.
- **Verdict**: **Ready for Prototype (Phase 4)**.

### 2.5 GIS Site Mapping & Drone Orthomosaics: MapLibre GL JS & Turf.js
- **Target Capability**: Plotting site boundaries, drone survey orthomosaic overlays, elevation contours, GPS equipment trackers, and calculating boundary areas.
- **Recommended Libraries**: maplibre-gl (BSD-3-Clause) + @turf/turf (MIT).
- **Architecture**:
  - High-performance vector tile rendering with WebGL.
  - Supports self-hosted OpenStreetMap vector tiles, satellite raster layers, and custom GeoTIFF/PNG orthomosaic overlays.
  - Turf.js provides client-side geometric calculations (area in square meters/hectares, linear perimeter, coordinate transformations).
- **Verdict**: **Ready for Integration (Phase 4)**.

### 2.6 Digital Signatures & Lien Waivers: Documenso
- **Target Capability**: Legally binding electronic signatures for subcontractor agreements, change order approvals, and monthly lien waivers.
- **Recommended Platform**: Documenso (AGPL-3.0 / Self-Hosted Docker Service).
- **Integration Boundary**:
  - Engoryx backend communicates with a self-hosted Documenso instance via REST/GraphQL API and signed webhooks.
  - Preserves AGPL-3.0 compliance boundaries by keeping Documenso as an independent network service.
- **Verdict**: **Prototype / Sandbox (Phase 6)**.

### 2.7 Document Intelligence: Docling
- **Target Capability**: High-accuracy parsing of complex engineering documents, multi-column contracts, tables, and title-block metadata extraction.
- **Recommended Library**: Docling (MIT, IBM Research / DS4SD).
- **Architecture**: Python-based backend worker utilizing PyTorch/OCR models for layout segmentation.
- **Verdict**: **Deferred / Phase 7+** (Current Gemini 2.5/3.5 multimodal extraction serves Phase 0-6 needs efficiently).

### 2.8 Field Communications & SMS: httpSMS
- **Target Capability**: Automated SMS alerts for crew shift schedules, inclement weather site shutdowns, and emergency broadcasts sent directly via low-cost local SIM cards.
- **Recommended Tool**: httpSMS (MIT Android client / API).
- **Architecture**:
  - Dedicated Android field phone running the httpSMS gateway application.
  - Engoryx Express backend dispatches SMS messages via the encrypted httpSMS API.
- **Verdict**: **Ready for Integration (Phase 8)**.

---

## 3. License Caveats & Rejected Alternatives

### Caution: tldraw (v2) License Restrictions
- **Assessment**: 	ldraw is a popular canvas drawing tool, but its v2 release uses the **TLDRAW NON-COMMERCIAL LICENSE** for its pre-built components and commercial licensing fees.
- **Decision**: **REJECTED** for commercial product integration. Use **Konva.js** (MIT) or **Excalidraw** (MIT) instead.

### Caution: Heavy Proprietary PDF Viewers
- **Assessment**: Commercial PDF SDKs (e.g. PDFTron / Apryse, PSPDFKit) introduce high recurring per-seat costs and closed-source dependencies.
- **Decision**: **REJECTED**. Use open-source **Mozilla PDF.js** + **Konva.js** for full ownership, zero per-seat licensing costs, and complete UI customization.
