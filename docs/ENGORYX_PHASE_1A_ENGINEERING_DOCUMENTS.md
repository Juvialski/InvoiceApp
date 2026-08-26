# ENGORYX — Phase 1A: Engineering Documents & Blueprint Viewer

Engoryx Phase 1A delivers centralized engineering document management, multi-page blueprint viewing, immutable revision tracking, and interactive layered redline markups for architecture, engineering, and construction (AEC) projects.

---

## 1. Executive Summary

Phase 1A-establishes the core technical document foundation for Engoryx, enabling project teams to organize, inspect, and annotate engineering drawings and technical spec sheets:

- **Centralized Document Control**: Multi-discipline drawing registers categorized by standard AEC disciplines (Architectural, Structural, Civil, Mechanical, Electrical, Plumbing, Fire Protection, Geotechnical, General Engineering).
- **High-Performance Blueprint Viewer**: Multi-page PDF vector rendering via Mozilla PDF.js coupled with an interactive annotation stage via Konva.js.
- **Normalized Coordinate Space**: Resolution-independent redline annotations ($0.0 - 1.0$ page space) ensuring markups scale seamlessly across high-DPI desktop screens, tablets, and mobile devices.
- **Strict Multi-Tenancy & RBAC**: PostgreSQL Row-Level Security (RLS) policies and company tenant boundaries protecting all document assets.
- **Private Storage Bucket**: Secure, authenticated file storage (`engineering-documents`) enforcing company isolation at the storage path level.
- **Immutable Revision History**: Strict append-only revision records guaranteeing historical and contractual non-repudiation.

---

## 2. Database Schema & Data Invariants

Phase 1A introduces three core relational tables defined in `supabase/migrations/20260826130000_engineering_documents_foundation.sql`:

- `public.engineering_documents`: Represents document metadata company-wide, spanning disciplines, document types, project associations, tags, current revision, and audit trails.
- `public.engineering_document_revisions`: Represents immutable revision sheets, file fingerprints (SHA-256), sheet sizes, scales, page counts, and review statuses.
- `public.drawing_annotations`: Represents interactive redline markups (clouds, rectangles, arrows, callouts, measurements, text) stored with normalized geometry, styles, and statuses.

---

## 3. Multi-Tenancy & RBAC Controls

Access control is governed by granular permissions:

- `engineering.documents.read`: Read company documents, revisions, and annotations.
- `engineering.documents.create`: Create documents and upload new revisions.
- `engineering.documents.update`: Update metadata and manage annotations.
- `engineering.documents.manage`: Full administrative control including archiving.

---

## 4. Private Supabase Storage Architecture

- **Bucket IDe*: `engineering-documents` (`public: false`).
- **Path Structure**: `companies/<company_id>/projects/<project_id>/documents/<document_id>/<revision_number>_<filename>` or `companies/<company_id>/...b
- **Storage RLS**: Enforces permissions via `private.storage_company_id(name)` and `has_company_permission`.

---

## 5. Normalized Coordinate System & Viewer Architecture

- **Coordinate Normalization**: All annotation points, rectangles, and bounding boxes are normalized to $[0.0, 1.0]$ in page space, guaranteeing pixel-perfect rendering across all viewport resolutions, zoom levels, and device DOPs.
- **Viewer Stack**: Mozilla PDF.js vector background rendering + Konva.js interactive markup layer.
- **Deep Linking**: Fully integrated with app routing at `/projects/:projectId/documents` with query parameters (`?docId=...&revId=...&page=...`).

---

## 6. Roadmap for Phase 1B and Phase 1C
Phase 1 continues with sursquent deliverables:

- **Phase 1B (Planned)**: RFIs (Requests for Information) and Technical Submittal packages with Engineer-of-Record (EOR) approval flows.
- **Phase 1C (Planned)**: Daily Site Logs, Weather Tracking, Crew Headcounts, and Heavy Equipment utilization.
