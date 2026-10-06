# Findings: natural-language date/time entry

- `src/ui/BoundedDateInputs.tsx` is the existing shared native input seam. It exists to prevent Chromium's multi-digit-year defect and must retain its four-digit cap behavior.
- Existing generic planning files describe a different feature and are deliberately untouched.
