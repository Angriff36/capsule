# Findings

- Starting tree was clean.
- Manifest uses `property indexed`, producing single-field indexes alongside tenant indexes; repository-level composite index declarations belong in `manifest.config.yaml`.
- Calendar month data is a bounded server seam (`convex/eventCalendarMonth.ts`); calendar UI is `src/features/home/HomeCalendarPage.tsx`.
- The notification tray derives notifications from source records, so owner notification will use a dedicated durable notice rather than pretending a generic notification record exists.
