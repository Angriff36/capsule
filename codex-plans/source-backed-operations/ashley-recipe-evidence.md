# Ashley recipe reconstruction evidence

Source: `.artifacts\tpp-migration-20260905\tpp_migration\reports\event_specific\Menu_Item_Cost_per_Event.xlsx`, sheet1. Event totals are for the servings shown. Methods come from `.artifacts\tpp-migration-20260905\tpp_migration\reports\event_specific\Heating_and_Serving_Event_Menu.xlsx`. This is an evidence map, not an apply-ready migration. A named make step establishes preparation work and a candidate separately prepared component; it does not establish a complete recipe, batch yield or method. Repeated preparation of the same food must not duplicate purchasing.

## Ahi Tuna Wonton — 42 servings

Finished dish, source row 6. Event service method: E11.

| Row | Work / relationship                                                                         | Event amount  | Ingredient evidence                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | Crust tuna with black and white sesame seeds — prep work; no separate component established | 42 Oz - Dry   | Ahi Tuna ***: 2.625 Pound (row 10); White Sesame Seeds ***: 2.625 Oz - Dry (row 12); Black Sesame Seeds ***: 2.625 Oz - Dry (row 14)                                                                                |
| 16  | Sear both sides of tuna to rare — prep work; no separate component established              | 42 Oz - Dry   | None in this workbook                                                                                                                                                                                               |
| 18  | Make wasabi aioli — prep work referencing a separately prepared component                   | 10.5 Oz - Fld | Wasabi Paste ***: 0.1640625 Cup - Fld (row 20); Mayonnaise: 0.65625 Cup (row 22); Ginger ***: 0.328125 Tblsp - Dry (row 24); Garlic: 0.328125 Tblsp - Dry (row 26); Rice Vinegar ***: 0.08203125 Cup - Fld (row 28) |
| 30  | Portion togarashi — prep work; no separate component established                            | 42 Gram       | Togarashi *: 0.0925942256477186 Quart (row 32)                                                                                                                                                                      |
| 34  | Portion micro greens — prep work; no separate component established                         | 10.5 Gram     | Micro Greens: 0.370376902590875 Oz - Dry (row 36)                                                                                                                                                                   |
| 38  | Punch out wonton rounds using 1 inch punch — prep work; no separate component established   | 84 Each       | Wonton ***: 84 Each (row 40)                                                                                                                                                                                        |
| 42  | Fry wonton rounds — prep work; no separate component established                            | 84 Each       | None in this workbook                                                                                                                                                                                               |

**Source discrepancy at row 30:** Prep measures 42 grams of togarashi; costing labels the ingredient quantity as quarts. No density conversion established.

## Bruschetta Crostini — 42 servings

Finished dish, source row 61. Event service method: E17.

| Row | Work / relationship                                                                    | Event amount  | Ingredient evidence                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 63  | Slice and Toast Crostini (Google Drive) — prep work; no separate component established | 84 Piece      | Crostinis: 84 Piece (row 65)                                                                                                                                                |
| 67  | Cut and portion basil — prep work; no separate component established                   | 4.2 Oz - Dry  | Basil - Fresh: 0.2625 Pound (row 69)                                                                                                                                        |
| 71  | Portion balsamic glaze — prep work; no separate component established                  | 10.5 Oz - Fld | Balsamic Glaze: 10.5 Oz - Fld (row 73)                                                                                                                                      |
| 75  | Make bruschetta mix — prep work referencing a separately prepared component            | 84 Oz - Fld   | Garlic: 2.625 Tblsp - Dry (row 77); Olive Oil: 0.65625 Cup - Fld (row 79); Cheese - Shredded Parmesan: 0.984375 Cup (row 81); Balsamic Vinegar: 0.433125 Cup - Fld (row 83) |

**Source discrepancy at row 75:** Menu description names tomato-basil topping; nested costing ingredients omit tomatoes. Do not treat this ingredient list as complete.

## Mini Lobster Roll — 42 servings

Finished dish, source row 89. Event service method: E91.

| Row | Work / relationship                                                                               | Event amount | Ingredient evidence                             |
| --- | ------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------- |
| 91  | Portion micro greens — prep work; no separate component established                               | 126 Gram     | Micro Greens: 4.4445228310905 Oz - Dry (row 93) |
| 95  | Make Mini Buns (Drive Recipe) — prep work referencing a separately prepared component             | 84 Each      | None in this workbook                           |
| 97  | Portion tarragon — prep work; no separate component established                                   | 126 Gram     | None in this workbook                           |
| 99  | Make and portion rolls (for lobster) — prep work; no separate component established               | 84 Each      | None in this workbook                           |
| 101 | Make lobster salad (weight after prepped) — prep work referencing a separately prepared component | 42 Oz - Dry  | None in this workbook                           |

**Source discrepancy at row 95:** Mini buns and the later roll-making step may describe the same dough/roll work. Resolve recipe identity before creating two components.

**Source discrepancy at row 99:** Possibly duplicates the mini-bun step; preserve existing work while checking dough/portion relationship.

## Fried Gourmet Mac n Cheese Bites — 42 servings

Finished dish, source row 116. No service method in the event-method workbook.

| Row | Work / relationship                                                                                              | Event amount  | Ingredient evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 118 | Make Elbow Pasta (Google Drive) — prep work referencing a separately prepared component                          | 10.5 Oz - Dry | Dry Elbow Pasta: 0.65625 Pound (row 120); Olive Oil: 1.3125 Tblsp - Fld (row 122)                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 124 | Make Gourmet Mac n' Cheese Sauce (Google Drive) — prep work referencing a separately prepared component          | 168 Oz - Fld  | Butter (unsalted): 0.2625 Pound (row 126); All Purpose Flour: 0.2625 Pound (row 128); Whole Milk: 0.525 Gallon (row 130); Heavy Whipping Cream: 0.13125 Gallon (row 132); Salt: 0.7875 Tblsp - Dry (row 134); White Pepper: 0.525 Tblsp - Dry (row 136); Spice - Granulated Garlic: 0.2625 Tblsp - Dry (row 138); Cheese - Gruyere: 1.05 Pound (row 140); Cheese - Shredded Parmesan: 1.05 Cup (row 142); Cheese - Cougar Gold: 1.05 Pound (row 144); Cheese - Velveeta American: 0.65625 Pound (row 146); Corn Starch: 0.065625 Pound (row 148) |
| 150 | Make Mac Balls (Google Drive) — prep work referencing a separately prepared component                            | 84 Each       | None in this workbook                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 152 | Bread mac balls with flour egg and panko (.95 oz in final weight) — prep work; no separate component established | 84 Each       | None in this workbook                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 155 | Make Bacon Jam (Google Drive) — prep work referencing a separately prepared component                            | 10.5 Oz - Fld | None in this workbook                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 157 | Portion pick for appetizer — equipment/consumables packing work                                                  | 84 Each       | None in this workbook                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 159 | Portion micro greens — prep work; no separate component established                                              | 42 Gram       | Micro Greens: 1.4815076103635 Oz - Dry (row 161)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 163 | Portion parmesan and romano — prep work; no separate component established                                       | 4.2 Oz - Dry  | Cheese - Parmesan / Romano Blend: 0.2625 Pound (row 165)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Source discrepancy at row 124:** Same sauce conflict as main mac: Gruyere/cornstarch units require source resolution.

**Source discrepancy at row 152:** Breaded mac balls require flour, egg and panko by step name but no ingredient quantities are supplied here.

## Chicken Katsu Bao Bun — 42 servings

Finished dish, source row 178. No service method in the event-method workbook.

| Row | Work / relationship                                                                                                                      | Event amount  | Ingredient evidence   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------- |
| 180 | Make Chicken Katsu (Google Drive) — prep work referencing a separately prepared component                                                | 42 Recipe     | None in this workbook |
| 182 | Portion micro cilantro — prep work; no separate component established                                                                    | 6.3 Oz - Dry  | None in this workbook |
| 184 | Make Cucumber Kimchi (Google Drive) — prep work referencing a separately prepared component                                              | 12.6 Oz - Dry | None in this workbook |
| 186 | Portion bao bun into 2" perf pan — prep work; no separate component established                                                          | 84 Each       | None in this workbook |
| 188 | Make Sambal Aioli (Google Drive) — prep work referencing a separately prepared component                                                 | 21 Oz - Fld   | None in this workbook |
| 190 | Portion Fryer Oil (check with ops on exact qty needed - 53 lbs for large fryer/18 lbs for small fryer) — equipment-dependent preparation | 42 Pound      | None in this workbook |

**Source discrepancy at row 190:** Fryer oil is equipment-dependent: source explicitly says 53 lb large fryer / 18 lb small fryer. Do not use 1 lb per guest as a recipe rate.

## Mid Summer Wedding Salad — 167 servings

Finished dish, source row 228. Event service method: E72.

| Row | Work / relationship                                                                                     | Event amount   | Ingredient evidence                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 230 | Portion mixed greens — prep work; no separate component established                                     | 250.5 Oz - Dry | Spring Mix: 15.65625 Pound (row 232)                                                                                                                                                                                                                                                                                                                                    |
| 234 | Slice strawberries — prep work; no separate component established                                       | 250.5 Oz - Dry | Strawberries: 15.65625 Pound (row 236)                                                                                                                                                                                                                                                                                                                                  |
| 238 | Shave fennel — prep work; no separate component established                                             | 41.75 Oz - Dry | Fennel - Fresh: 2.609375 Pound (row 240)                                                                                                                                                                                                                                                                                                                                |
| 242 | Portion gorgonzola — prep work; no separate component established                                       | 83.5 Oz - Dry  | Fennel - Fresh: 5.21875 Oz - Dry (row 244)                                                                                                                                                                                                                                                                                                                              |
| 246 | Candy walnuts — prep work referencing a separately prepared component                                   | 83.5 Oz - Dry  | Toasted Walnuts: 5.21875 Pound (row 248); Cooking Water: 0.521875 Cup - Fld (row 250); Spice - Cayenne Pepper: 0.521875 Tsp - Dry (row 252); Salt: 0.521875 Tsp - Dry (row 254); White Sugar: 1.565625 Cup (row 256)                                                                                                                                                    |
| 258 | Salad Dressing - Raspberry Balsamic Vinaigrette — prep work referencing a separately prepared component | 334 Oz - Fld   | Raspberry Jam: 83.5 Oz - Fld (row 260); Balsamic Vinegar: 3.47916666666667 Cup - Fld (row 262); Red Wine Vinegar: 1.73958333333333 Cup (row 264); Honey: 3.47916666666667 Cup (row 266); Spice - Cinnamon: 3.47916666666667 Tblsp - Dry (row 268); Lemon Juice: 3.47916666666667 Tblsp - Fld (row 270); Eggs: 20.875 Each (row 272); Olive Oil: 5.21875 Quart (row 274) |

**Source discrepancy at row 242:** Gorgonzola prep is 83.5 oz, but nested costing points at Fennel 5.21875 oz. Menu description independently names gorgonzola. This is a source identity/quantity conflict.

## Fresh Baked Dinner Rolls with Honey Butter — 167 servings

Finished dish, source row 292. Event service method: E56.

| Row | Work / relationship                                                                         | Event amount   | Ingredient evidence                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 294 | Make Honey Cinnamon Butter (recipe) — prep work referencing a separately prepared component | 41.75 Oz - Dry | Margarine: 1.60576923076923 Pound (row 296); Honey: 1.20432692307692 Cup (row 298); Spice - Cinnamon: 1.20432692307692 Oz - Dry (row 300) |
| 302 | Proof and bake rolls — prep work; no separate component established                         | 167 Each       | Dinner Rolls: 167 Each (row 304); Eggs: 13.861 Each (row 306)                                                                             |

**Source discrepancy at row 294:** Photographed honey butter yields 2 qt from one tub of blend; tub mass is unspecified and differs from costing margarine formula. Preserve separate evidence.

## Chicken Roulade — 167 servings

Finished dish, source row 348. Event service method: E28.

| Row | Work / relationship                                                                                | Event amount    | Ingredient evidence                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 350 | Pull Airline chicken and thaw if needed (6 oz EACH) — prep work; no separate component established | 167 Each        | Airline Chicken: 1670 Oz - Dry (row 352)                                                                                                                                               |
| 354 | Make Chicken Roulade Stuffing — prep work referencing a separately prepared component              | 334 Tblsp - Fld | Basil Pesto: 3.47916666666667 Pound (row 356); Cream Cheese: 10.4375 Pound (row 358)                                                                                                   |
| 360 | Pipe pesto cream and wrap chicken with prosciutto — prep work; no separate component established   | 167 Serving     | Salt: 3.34 Oz - Dry (row 362); Pepper: 3.34 Oz - Dry (row 364); Prosciutto: 83.5 Oz - Dry (row 366)                                                                                    |
| 368 | Make chicken cream sauce — prep work referencing a separately prepared component                   | 167 Oz - Fld    | Olive Oil: 0.326171875 Cup - Fld (row 370); Garlic: 0.65234375 Cup (row 372); White Wine (in drip cup): 2.609375 Cup - Fld (row 374); Heavy Whipping Cream: 1.3046875 Gallon (row 376) |
| 378 | Portion spring mix and micro greens — prep work; no separate component established                 | 83.5 Gram       | Spring Mix: 1.96358548357702 Oz - Dry (row 380); Micro Greens: 0.981792741788509 Oz - Dry (row 382)                                                                                    |

**Source discrepancy at row 350:** Step says 6 oz EACH, costing uses 10 oz chicken per serving. Investigate raw vs finished portion; do not invent a yield factor.

## Asparagus — 167 servings

Finished dish, source row 405. Event service method: E13.

| Row | Work / relationship                                                      | Event amount  | Ingredient evidence                                  |
| --- | ------------------------------------------------------------------------ | ------------- | ---------------------------------------------------- |
| 407 | Snip and blanch asparagus — prep work; no separate component established | 501 Oz - Dry  | Asparagus: 31.3125 Pound (row 409)                   |
| 411 | Portion lemons — prep work; no separate component established            | 41.75 Each    | Lemons: 41.75 Each (row 413)                         |
| 415 | Portion Butter — prep work; no separate component established            | 167 Oz - Dry  | Butter (unsalted): 10.4375 Pound (row 417)           |
| 419 | Portion sea salt — prep work; no separate component established          | 16.7 Oz - Dry | Sea Salt ***: 1.04375 Pound (row 421)                |
| 423 | Portion shaved parmesan — prep work; no separate component established   | 167 Oz - Dry  | Cheese - Shaved Parmesan: 10.4375 Oz - Dry (row 425) |

**Source discrepancy at row 423:** Prep says 167 oz shaved Parmesan; costing says 10.4375 oz. Owner clarification is pending.

## Cougar Gold Gourmet Mac n Cheese — 167 servings

Finished dish, source row 462. Event service method: E43.

| Row | Work / relationship                                                                                     | Event amount   | Ingredient evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 464 | Make Gourmet Mac n' Cheese Sauce (Google Drive) — prep work referencing a separately prepared component | 501 Oz - Fld   | Butter (unsalted): 0.7828125 Pound (row 466); All Purpose Flour: 0.7828125 Pound (row 468); Whole Milk: 1.565625 Gallon (row 470); Heavy Whipping Cream: 0.39140625 Gallon (row 472); Salt: 2.3484375 Tblsp - Dry (row 474); White Pepper: 1.565625 Tblsp - Dry (row 476); Spice - Granulated Garlic: 0.7828125 Tblsp - Dry (row 478); Cheese - Gruyere: 3.13125 Pound (row 480); Cheese - Shredded Parmesan: 3.13125 Cup (row 482); Cheese - Cougar Gold: 3.13125 Pound (row 484); Cheese - Velveeta American: 1.95703125 Pound (row 486); Corn Starch: 0.195703125 Pound (row 488) |
| 490 | Make Elbow Pasta (Google Drive) — prep work referencing a separately prepared component                 | 167 Oz - Dry   | Dry Elbow Pasta: 10.4375 Pound (row 492); Olive Oil: 20.875 Tblsp - Fld (row 494)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 496 | Make panko bread topping — prep work referencing a separately prepared component                        | 41.75 Cup      | Panko: 31.3125 Cup (row 498); Cheese - Shredded Parmesan: 10.4375 Cup (row 500); Spice - Parsley: 31.3125 Tblsp - Dry (row 502); Spice - Basil: 20.875 Tsp - Dry (row 504); Spice - Oregano: 20.875 Tsp - Dry (row 506); Salt: 5.21875 Tblsp - Dry (row 508); Pepper: 10.4375 Tsp - Dry (row 510)                                                                                                                                                                                                                                                                                    |
| 512 | Chop and cook bacon (weight in cooked) — prep work; no separate component established                   | 41.75 Oz - Dry | Bacon Bits: 2.609375 Pound (row 514)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Source discrepancy at row 464:** Photographed 5-gallon sauce and costing disagree on Gruyere and cornstarch units. Owner clarification is pending.

## Whipped Yukon Mashed Potatoes — 167 servings

Finished dish, source row 527. Event service method: E131.

| Row | Work / relationship                                                                                    | Event amount | Ingredient evidence                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 529 | Make Yukon gold whipped mashed potato — prep work referencing a separately prepared component          | 2.839 Batch  | Butter (unsalted): 5.678 Pound (row 531); Evaporated Milk ***: 5.678 Quart (row 533); Salt: 1.4195 Cup (row 535); White Pepper: 17.034 Tblsp - Dry (row 537); Yukon Potatoes: 56.78 Pound (row 539) |
| 541 | Make garnish for potato reheat (Recipe in TPP) — prep work referencing a separately prepared component | 167 Serving  | Butter: 83.5 Oz - Dry (row 543); Canned Milk: 83.5 Oz - Fld (row 545)                                                                                                                               |

## Smore Bar — 167 servings

Finished dish, source row 581. Event service method: E108.

| Row | Work / relationship                                                                                                       | Event amount    | Ingredient evidence                      |
| --- | ------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------- |
| 583 | Temper white chocolate — prep work; no separate component established                                                     | 167 Tblsp - Fld | None in this workbook                    |
| 585 | Portion graham crackers and drizzle with reg chocolate and white chocolate — prep work; no separate component established | 334 Each        | None in this workbook                    |
| 588 | Portion marshmallows — prep work; no separate component established                                                       | 167 Each        | None in this workbook                    |
| 590 | Portion nutella — prep work; no separate component established                                                            | 167 Tblsp - Fld | None in this workbook                    |
| 592 | Portion Reese's spread — prep work; no separate component established                                                     | 167 Tblsp - Fld | None in this workbook                    |
| 594 | Portion Hershey bar — prep work; no separate component established                                                        | 55.11 Each      | None in this workbook                    |
| 596 | Portion long skewers — equipment/consumables packing work                                                                 | 183.7 Each      | None in this workbook                    |
| 598 | Portion Chocolate Sauce — prep work; no separate component established                                                    | 83.5 Oz - Fld   | Chocolate Sauce: 83.5 Oz - Fld (row 600) |
| 602 | Portion Caramel Sauce — prep work; no separate component established                                                      | 83.5 Oz - Fld   | Caramel Sauce: 83.5 Oz - Fld (row 604)   |

## New York Strip — 167 servings

Finished dish, source row 639. Event service method: E95.

| Row | Work / relationship                                                                           | Event amount  | Ingredient evidence                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 641 | Make creamy Horseradish — prep work referencing a separately prepared component               | 167 Oz - Fld  | Sour Cream: 5.21875 Pound (row 643); Horseradish: 2.609375 Cup - Fld (row 645); Garlic: 0.434895833333333 Cup (row 647); Worcestershire: 6.95833333333333 Tblsp - Fld (row 649); Ground Black Pepper: 3.47916666666667 Tblsp - Dry (row 651); Spice - Thyme: 5.21875 Tblsp - Fld (row 653) |
| 655 | Rub new york strip — prep work; no separate component established                             | 1002 Oz - Dry | None in this workbook                                                                                                                                                                                                                                                                      |
| 657 | Make Chimmicurri Sauce (Google Drive) — prep work referencing a separately prepared component | 167 Oz - Fld  | Chimmicurri Sauce: 10.4375 Pound (row 659)                                                                                                                                                                                                                                                 |

## Infused Water — 334 servings

Finished dish, source row 665. Event service method: E66.

| Row | Work / relationship                                                                                                       | Event amount  | Ingredient evidence                      |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------- |
| 667 | Make 'infused water kit' - ONLY 1 PER BEV CONTAINER - ASK IF MORE THAN 1 (Drive recipe) — equipment-dependent preparation | 4.175 Batch   | Infused Water Kit: 4.175 Batch (row 671) |
| 673 | Portion drinking water (filtered or bottled) MINIMUM 5 GALLONS — prep work; no separate component established             | 20.875 Gallon | None in this workbook                    |
| 676 | Portion ice for consumption — prep work; no separate component established                                                | 83.5 Pound    | None in this workbook                    |

**Source discrepancy at row 667:** Kit is explicitly one per beverage container; 4.175 batch is not a verified container count. Keep equipment-dependent.

## Tableside Water Service - Bringing Water — 167 servings

Finished dish, source row 693. Event service method: E116.

| Row | Work / relationship                                                                                           | Event amount  | Ingredient evidence   |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------- | --------------------- |
| 695 | Portion drinking water (filtered or bottled) MINIMUM 5 GALLONS — prep work; no separate component established | 1670 Oz - Fld | None in this workbook |
| 698 | Portion ice for consumption — prep work; no separate component established                                    | 83.5 Pound    | None in this workbook |
