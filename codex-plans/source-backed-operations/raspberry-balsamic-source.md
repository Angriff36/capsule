# Raspberry balsamic vinaigrette — reconstructed source component

Source: `Salad_Dressing.xlsx`, sheet1 A336 (name), B338 (3-quart yield), rows343–350 (ingredients), A352 (method). The same recipe appears in Buffet_Style.xlsx and Heart_City.xlsx. Event comparison: Menu_Item_Cost_per_Event.xlsx, Ashley salad step row258 and ingredients rows260–274.

Yield: **3 quarts**. Ashley uses **2 fluid ounces per serving**: 167 servings require **334 fluid ounces = 10.4375 quarts**, or **3.4791666667 recipe batches**. Four full batches is a kitchen rounding choice, not the exact ingredient demand.

Method: Combine all ingredients except oils and mix with an immersion blender. Slowly add oils while continuing to mix.

| Ingredient       | Batch quantity | Ashley event quantity | Costing row |
| ---------------- | -------------- | --------------------- | ----------- |
| Raspberry Jam    | 0.75 quart     | 2.609375 quart        | 260         |
| Balsamic Vinegar | 1 cup          | 3.47916667 cup        | 262         |
| Red Wine Vinegar | 0.5 cup        | 1.73958333 cup        | 264         |
| Honey            | 1 cup          | 3.47916667 cup        | 266         |
| Spice - Cinnamon | 1 tablespoon   | 3.47916667 tablespoon | 268         |
| Lemon Juice      | 1 tablespoon   | 3.47916667 tablespoon | 270         |
| Eggs             | 6 each         | 20.875 each           | 272         |
| Olive Oil        | 1.5 quart      | 5.21875 quart         | 274         |

All eight calculated event ingredient amounts agree with the original event costing within 1e-8 in compatible units. No density conversion was used. The component candidate is `.artifacts/operations-source-study/raspberry-balsamic-component.json`. This reconstructs the dressing only; the salad gorgonzola conflict and remaining dish relationships still require resolution before a full event repair.
