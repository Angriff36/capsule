# Findings

- No fuzzy-search package is installed. Existing shared candidates are `src/ui/SearchSelect.tsx` and `src/features/kitchen/IngredientOptionPicker.tsx`.
- Native selects are widespread; the feature must identify target fields by their foreign-key option data rather than replace all selects.
- The component catalog explicitly distinguishes searchable record pickers from action menus.
