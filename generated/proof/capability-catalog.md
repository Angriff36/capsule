# Manifest capability catalog

- Schema: `manifest-capability-catalog/v1`
- Manifest: `3.6.21`
- Projection: `convex`
- Preset: `convex-application@1.3.4`
- IR hash: `0afa363307cd9ac3760ad9ceaaa99ceb92a60166f70f7fe5a240bad3642dfb96:1e85a353683f8f3cee405eae530ffef87a980786d711a48682286728ae42d2a3:26f146885f0af70b3d05a99eeddcbf6930b37eaedfd137e4513487aaee09b73a:27beb6e160c59bb0fbd7b7e4a260ca57ca675bd683a7366e0a0d00b3fca360a5:2a4ea95cbd23fbb7fe982f8871566507e57da4e8f02c13d207ec26d49da2b0c7:2bb75da3d2180fd598100db6ea4a5ba23b22d1c37e795f1ec70fa5dabfa5ee2c:32756165ca0cba544f5bc9c0704a31b4ca0ed1ac0a49368f00508a41da760b5c:34d91d342d227dd2bcc42505fb227ebe592b8e69016fc3c4302a785b0bafc293:3cace1142ec170edf896abaae2033c1618158a914805d6f62a19889c5c016544:3eac4036bd3fbec9ded49b0ee9128c29abd2d7ed370a4a1eaba77b89dd4e0754:470ac5758d3f838778b3dfea6640c0ca03c728fae8c11e82fc805a81b783a824:49dfabd893026655ee0e439cc52624a892802114f8bc8884df33d113ff97876d:4d26350ace95e6633243ac163d9aa3a6d2e7d2ec67d48a36fda689220d6d7bd9:57838fb2d9616c87368b4801567e9f4543c8b46421fb392de2cd433acaba7d71:5c9fc96ba1838014c7ceb846b987c070f5901676fa0223f5a91f6ed61dae887f:5de6fbf74fdf5bbfda1602719d213343eaf691d2fbcd268b06109e04b38f54e6:62d08288929fcda84ccfeb3ef8475f33d5a867b51ba4e56ba537f030c2b9f2b3:7e7486fd901a601b2abd157671c9cf7f61583e5d775485e1c077543ace6f5767:834dc5f77f8a7dc29f1a33828120aa41ccfc5bd48b45287f932df57171b58a6c:84cef0a4a26771e3105beb6e7a9365b9499e8eb8f454b5082a0b2919f5a34927:856b9d38ec996605b5656a7dc0cf1be591198b151fbf7e76e15b5c2342a3c918:8bb356e37613dfd678659a9770de8fc71de9155bc8f7438d8e32bcb79c149f4d:8cb557ab62cbc859dc156f98eca50a0f95809e2065991debfa207a3f7585bba7:99b2b59742684a90590085f7e9c94c22433ebd3552e4a171c4ba24b2b4fd669f:a46c5e97573d9352884f09685287d09a9ba8cd95baf49a11be8f3ca25f8fb2c2:a617c75b66c794a512c36efeb4c7321c500f1ec64b5052d6ee4845db5fbc3195:a8ecbe2b86abfca2e08c3e5a4810a228408ef970010ba70cecd5954b607e66a9:b1a8b188b293f8d5ddde7fdee91346f4f81897c89f7ff342d3671089d689d87e:cabf02d93a2bbe83580f55c66199ca137e59d0a1a350325e3d740c67a1a46730:d0bb8467f61bb15ed9285ad71803d6233449165a0df0e213d9dc4478925ba1aa:d12bfae4193927591fa0009cb283e0afb124230d008bc18fc1090f536dc86bd5:d6238f09f3f1f9a2dcd8703d05f8b44b3a965ca0700924109c47472d3b404032:ea25156e0553678af52f854eb24c9508395a4021ff1ddd4338bb2d178b574b08:eeee3923b778a88047d8a9693e9f0e09b68344415eb7621a5d2978f9b8f6bc1b:f17ecc5a823c4120e3ad70967af44f604b10b3565b2b8034448a1ae9c9245f3f:fc6fc169e43b78e91acac17a2e59653d28cefd387dc17ed332dbc1dc5b4e049a`

## AvailabilityWindow

- Table: `availabilityWindows`
- List: `listAvailabilityWindow`
- Detail: `getAvailabilityWindow`
- Create: `AvailabilityWindow_createViaDeclare` / `useCreateAvailabilityWindow`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `workforceAccess`

### Commands
- `AvailabilityWindow_declare` emits AvailabilityDeclared
- `AvailabilityWindow_withdraw` emits AvailabilityWithdrawn

## Dish

- Table: `dishes`
- List: `listDish`
- Detail: `getDish`
- Create: `Dish_createViaIntroduce` / `useCreateDish`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `kitchenAccess`

### Commands
- `Dish_changeRecipe` emits DishRecipeChanged
- `Dish_classifyAllergens` emits DishAllergensClassified
- `Dish_introduce` emits DishIntroduced
- `Dish_reinstate` emits DishReinstated
- `Dish_retire` emits DishRetired
- `Dish_reviseDetails` emits DishDetailsRevised
- `Dish_updatePortioning` emits DishPortioningUpdated

## EventAssignment

- Table: `eventAssignments`
- List: `listEventAssignment`
- Detail: `getEventAssignment`
- Create: `EventAssignment_createViaAssign` / `useCreateEventAssignment`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `workforceAccess`

### Commands
- `EventAssignment_assign` emits EventAssignmentAssigned
- `EventAssignment_checkIn` emits EventAssignmentCheckedIn
- `EventAssignment_checkOut` emits EventAssignmentCheckedOut
- `EventAssignment_confirm` emits EventAssignmentConfirmed
- `EventAssignment_markNoShow` emits EventAssignmentNoShowMarked
- `EventAssignment_unassign` emits EventAssignmentUnassigned

## Ingredient

- Table: `ingredients`
- List: `listIngredient`
- Detail: `getIngredient`
- Create: `Ingredient_createViaIntroduce` / `useCreateIngredient`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `kitchenAccess`

### Commands
- `Ingredient_classifyAllergens` emits IngredientAllergensClassified
- `Ingredient_discontinue` emits IngredientDiscontinued
- `Ingredient_introduce` emits IngredientIntroduced
- `Ingredient_reinstate` emits IngredientReinstated
- `Ingredient_updateCosting` emits IngredientCostingUpdated
- `Ingredient_updateDetails` emits IngredientDetailsUpdated

## IngredientDemand

- Table: `ingredientDemands`
- List: `listIngredientDemand`
- Detail: `getIngredientDemand`
- Create: `IngredientDemand_createViaCalculate` / `useCreateIngredientDemand`
- Proof: structural=`generated` runtime=`runtime_proven`
- Capabilities: `inventoryAccess`

### Commands
- `IngredientDemand_calculate` emits IngredientDemandCalculated
- `IngredientDemand_confirm` emits IngredientDemandConfirmed
- `IngredientDemand_fulfill` emits IngredientDemandFulfilled
- `IngredientDemand_recalculate` emits IngredientDemandRecalculated
- `IngredientDemand_supersede` emits IngredientDemandSuperseded

### Reactions
- `EventApproved->IngredientDemand.confirm` → IngredientDemand.confirm (runtime=`declared`)
- `IngredientDemandConfirmed->PurchaseNeed.create` → PurchaseNeed.create (runtime=`runtime_proven`)

## Menu

- Table: `menus`
- List: `listMenu`
- Detail: `getMenu`
- Create: `Menu_createViaDraft` / `useCreateMenu`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `kitchenAccess`

### Commands
- `Menu_archive` emits MenuArchived
- `Menu_draft` emits MenuDrafted
- `Menu_markPublished` emits MenuPublished
- `Menu_restore` emits MenuRestored
- `Menu_reviseDetails` emits MenuDetailsRevised
- `Menu_unpublish` emits MenuUnpublished
- `Menu_updatePricing` emits MenuPricingUpdated

## PrepTask

- Table: `prepTasks`
- List: `listPrepTask`
- Detail: `getPrepTask`
- Create: `PrepTask_createViaOpen` / `useCreatePrepTask`
- Proof: structural=`generated` runtime=`runtime_proven`
- Capabilities: `kitchenAccess`

### Commands
- `PrepTask_cancel` emits PrepTaskCancelled
- `PrepTask_claim` emits PrepTaskClaimed
- `PrepTask_complete` emits PrepTaskCompleted
- `PrepTask_markBlocked` emits PrepTaskBlocked
- `PrepTask_open` emits PrepTaskOpened
- `PrepTask_release` emits PrepTaskReleased
- `PrepTask_start` emits PrepTaskStarted
- `PrepTask_unblock` emits PrepTaskUnblocked

### Reactions
- `EventCancelled->PrepTask.cancel` → PrepTask.cancel (runtime=`declared`)
- `QualityCheckFailed->PrepTask.markBlocked` → PrepTask.markBlocked (runtime=`runtime_proven`)

## PurchaseNeed

- Table: `purchaseNeeds`
- List: `listPurchaseNeed`
- Detail: `getPurchaseNeed`
- Create: `PurchaseNeed_create` / `useCreatePurchaseNeed`
- Proof: structural=`generated` runtime=`runtime_proven`
- Capabilities: `inventoryAccess`

### Commands
- `PurchaseNeed_cancel` emits PurchaseNeedCancelled
- `PurchaseNeed_create` emits PurchaseNeedOpened
- `PurchaseNeed_markFulfilled` emits PurchaseNeedFulfilled
- `PurchaseNeed_markOrdered` emits PurchaseNeedOrdered

### Reactions
- `EventCancelled->PurchaseNeed.cancel` → PurchaseNeed.cancel (runtime=`declared`)
- `IngredientDemandConfirmed->PurchaseNeed.create` → PurchaseNeed.create (runtime=`runtime_proven`)
- `VendorOrderLineAdded->PurchaseNeed.markOrdered` → PurchaseNeed.markOrdered (runtime=`declared`)

## Qualification

- Table: `qualifications`
- List: `listQualification`
- Detail: `getQualification`
- Create: `Qualification_createViaGrant` / `useCreateQualification`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `workforceAccess`

### Commands
- `Qualification_expire` emits QualificationExpired
- `Qualification_grant` emits QualificationGranted
- `Qualification_revoke` emits QualificationRevoked

## QualityCheck

- Table: `qualityChecks`
- List: `listQualityCheck`
- Detail: `getQualityCheck`
- Create: `QualityCheck_createViaOpen` / `useCreateQualityCheck`
- Proof: structural=`generated` runtime=`runtime_proven`
- Capabilities: `kitchenAccess`

### Commands
- `QualityCheck_fail` emits QualityCheckFailed
- `QualityCheck_open` emits QualityCheckOpened
- `QualityCheck_pass` emits QualityCheckPassed
- `QualityCheck_reinspect` emits QualityCheckReopened

### Reactions
- `QualityCheckFailed->PrepTask.markBlocked` → PrepTask.markBlocked (runtime=`runtime_proven`)

## Recipe

- Table: `recipes`
- List: `listRecipe`
- Detail: `getRecipe`
- Create: `Recipe_createViaDraft` / `useCreateRecipe`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `kitchenAccess`

### Commands
- `Recipe_draft` emits RecipeDrafted
- `Recipe_publishVersion` emits RecipeVersionPublished
- `Recipe_retire` emits RecipeRetired
- `Recipe_retract` emits RecipeVersionRetracted
- `Recipe_reviseDraft` emits RecipeDraftRevised

## RecipeIngredient

- Table: `recipeIngredients`
- List: `listRecipeIngredient`
- Detail: `getRecipeIngredient`
- Create: `RecipeIngredient_createViaAdd` / `useCreateRecipeIngredient`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `kitchenAccess`

### Commands
- `RecipeIngredient_add` emits RecipeIngredientAdded
- `RecipeIngredient_adjustQuantity` emits RecipeIngredientQuantityAdjusted
- `RecipeIngredient_remove` emits RecipeIngredientRemoved

## Shift

- Table: `shifts`
- List: `listShift`
- Detail: `getShift`
- Create: `Shift_createViaSchedule` / `useCreateShift`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `workforceAccess`

### Commands
- `Shift_cancel` emits ShiftCancelled
- `Shift_complete` emits ShiftCompleted
- `Shift_markNoShow` emits ShiftNoShowMarked
- `Shift_schedule` emits ShiftScheduled
- `Shift_start` emits ShiftStarted

## TimeRecord

- Table: `timeRecords`
- List: `listTimeRecord`
- Detail: `getTimeRecord`
- Create: `TimeRecord_createViaClockIn` / `useCreateTimeRecord`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `workforceAccess`

### Commands
- `TimeRecord_clockIn` emits TimeRecordClockedIn
- `TimeRecord_clockOut` emits TimeRecordClockedOut
- `TimeRecord_correct` emits TimeRecordCorrected
