# Manifest capability catalog

- Schema: `manifest-capability-catalog/v1`
- Manifest: `3.6.29`
- Projection: `convex`
- Preset: `convex-application@1.3.5`
- IR hash: `0afa363307cd9ac3760ad9ceaaa99ceb92a60166f70f7fe5a240bad3642dfb96:16f5b86fa64677653383a3565cc55ae5abd29b5f0ab299becbd63a2a989ea054:1e85a353683f8f3cee405eae530ffef87a980786d711a48682286728ae42d2a3:21075d4f48878597cbafeabc7f13915953acbecc05e9a4359807dabb2ed87e79:27beb6e160c59bb0fbd7b7e4a260ca57ca675bd683a7366e0a0d00b3fca360a5:2a4ea95cbd23fbb7fe982f8871566507e57da4e8f02c13d207ec26d49da2b0c7:2bb75da3d2180fd598100db6ea4a5ba23b22d1c37e795f1ec70fa5dabfa5ee2c:3124934dc655f9f6e4f8ce966db19a1ed59732188ac81d5ef63953b00221815c:32756165ca0cba544f5bc9c0704a31b4ca0ed1ac0a49368f00508a41da760b5c:3cace1142ec170edf896abaae2033c1618158a914805d6f62a19889c5c016544:3eac4036bd3fbec9ded49b0ee9128c29abd2d7ed370a4a1eaba77b89dd4e0754:470ac5758d3f838778b3dfea6640c0ca03c728fae8c11e82fc805a81b783a824:49dfabd893026655ee0e439cc52624a892802114f8bc8884df33d113ff97876d:4b2e6ec9ec9ffc8b508e3e38a26dce3dc4a31267f0c46372060bd9bd7164ec8f:4d26350ace95e6633243ac163d9aa3a6d2e7d2ec67d48a36fda689220d6d7bd9:5c9fc96ba1838014c7ceb846b987c070f5901676fa0223f5a91f6ed61dae887f:5de6fbf74fdf5bbfda1602719d213343eaf691d2fbcd268b06109e04b38f54e6:62d08288929fcda84ccfeb3ef8475f33d5a867b51ba4e56ba537f030c2b9f2b3:728e61c032fe46367413548d0842c84d372b976db2ce834510b96157d0a2557b:7e7486fd901a601b2abd157671c9cf7f61583e5d775485e1c077543ace6f5767:84adc3b714a25afb1ba3a1e32b8b46bac665535ecb1fea6851b3e292fb3aa88c:84cef0a4a26771e3105beb6e7a9365b9499e8eb8f454b5082a0b2919f5a34927:856b9d38ec996605b5656a7dc0cf1be591198b151fbf7e76e15b5c2342a3c918:8bb356e37613dfd678659a9770de8fc71de9155bc8f7438d8e32bcb79c149f4d:912275cde11d5e8a1d08152b4e4a7b9ce259359101cbccb87198e639e3cda783:9e32b3a907507588d9a813328d43ea85d61feefc1a41b32b59e72ee41c2356bd:a8ecbe2b86abfca2e08c3e5a4810a228408ef970010ba70cecd5954b607e66a9:b1a8b188b293f8d5ddde7fdee91346f4f81897c89f7ff342d3671089d689d87e:ba90ae45d0e80c9a437ad3ff620ebc547764a4f6cd4cc05d572f396d2e41d157:bec4ea7d565af9b27b85ec557a71c3c29a6908d41fe7eb90630c4229d930bac6:c3c42392b912cba00235f49b58f357ab62cd011e5d194cf6103d0bd1f87daa78:cabf02d93a2bbe83580f55c66199ca137e59d0a1a350325e3d740c67a1a46730:d05949bc5ad00cd3eaf2e235a94dd8801ffbfce1dbd084f6bf7799b506cbadbb:d12bfae4193927591fa0009cb283e0afb124230d008bc18fc1090f536dc86bd5:d1c8e9bf945607639ca720a2f7b0f5819e0add00adf99f7a6a0098748c2c87d2:d6238f09f3f1f9a2dcd8703d05f8b44b3a965ca0700924109c47472d3b404032:d6910e1f58113618897b7fccf4dcbc6efd0fd1f39f05ac403e6a7f7c9a701a9f:ea25156e0553678af52f854eb24c9508395a4021ff1ddd4338bb2d178b574b08:f17ecc5a823c4120e3ad70967af44f604b10b3565b2b8034448a1ae9c9245f3f`

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

## Delivery

- Table: `deliveries`
- List: `listDelivery`
- Detail: `getDelivery`
- Create: `Delivery_createViaSchedule` / `useCreateDelivery`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `logisticsAccess`

### Commands
- `Delivery_cancel` emits DeliveryCancelled
- `Delivery_confirmDelivery` emits DeliveryConfirmed
- `Delivery_markFailed` emits DeliveryFailed
- `Delivery_schedule` emits DeliveryScheduled
- `Delivery_startTransit` emits DeliveryTransitStarted

### Reactions
- `EventCancelled->Delivery.cancel` → Delivery.cancel (runtime=`declared`)

## Dish

- Table: `dishes`
- List: `listDish`
- Detail: `getDish`
- Create: `Dish_createViaIntroduce` / `useCreateDish`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `kitchenAccess`

### Commands
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
- Capabilities: `inventoryAccess`, `manageAccess`

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

## PackList

- Table: `packLists`
- List: `listPackList`
- Detail: `getPackList`
- Create: `PackList_createViaOpen` / `useCreatePackList`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `logisticsAccess`

### Commands
- `PackList_cancel` emits PackListCancelled
- `PackList_dispatch` emits PackListDispatched
- `PackList_markLoaded` emits PackListLoaded
- `PackList_markPacked` emits PackListPacked
- `PackList_open` emits PackListOpened
- `PackList_startPacking` emits PackListPackingStarted

### Reactions
- `EventCancelled->PackList.cancel` → PackList.cancel (runtime=`declared`)

## PackListItem

- Table: `packListItems`
- List: `listPackListItem`
- Detail: `getPackListItem`
- Create: `PackListItem_createViaAddItem` / `useCreatePackListItem`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `logisticsAccess`

### Commands
- `PackListItem_addItem` emits PackListItemAdded
- `PackListItem_adjustQuantity` emits PackListItemQuantityAdjusted
- `PackListItem_markMissing` emits PackListItemMissing
- `PackListItem_markPacked` emits PackListItemPacked

## PrepTask

- Table: `prepTasks`
- List: `listPrepTask`
- Detail: `getPrepTask`
- Create: `PrepTask_createViaOpen` / `useCreatePrepTask`
- Proof: structural=`generated` runtime=`runtime_proven`
- Capabilities: `kitchenAccess`, `manageAccess`

### Commands
- `PrepTask_cancel` emits PrepTaskCancelled
- `PrepTask_claim` emits PrepTaskClaimed
- `PrepTask_complete` emits PrepTaskCompleted
- `PrepTask_markBlocked` emits PrepTaskBlocked
- `PrepTask_open` emits PrepTaskOpened
- `PrepTask_refreshGenerated` emits PrepTaskGeneratedRefreshed
- `PrepTask_release` emits PrepTaskReleased
- `PrepTask_revise` emits PrepTaskRevised
- `PrepTask_start` emits PrepTaskStarted
- `PrepTask_unblock` emits PrepTaskUnblocked

### Reactions
- `EventCancelled->PrepTask.cancel` → PrepTask.cancel (runtime=`declared`)
- `EventDishRemoved->PrepTask.cancel` → PrepTask.cancel (runtime=`declared`)
- `QualityCheckFailed->PrepTask.markBlocked` → PrepTask.markBlocked (runtime=`runtime_proven`)

## PurchaseNeed

- Table: `purchaseNeeds`
- List: `listPurchaseNeed`
- Detail: `getPurchaseNeed`
- Create: `PurchaseNeed_create` / `useCreatePurchaseNeed`
- Proof: structural=`generated` runtime=`runtime_proven`
- Capabilities: `inventoryAccess`

### Commands
- `PurchaseNeed_assignToDraft` emits PurchaseNeedDraftAssigned
- `PurchaseNeed_cancel` emits PurchaseNeedCancelled
- `PurchaseNeed_create` emits PurchaseNeedOpened
- `PurchaseNeed_markDraftOrdered` emits PurchaseNeedOrdered
- `PurchaseNeed_markFulfilled` emits PurchaseNeedFulfilled
- `PurchaseNeed_markOrdered` emits PurchaseNeedOrdered

### Reactions
- `EventCancelled->PurchaseNeed.cancel` → PurchaseNeed.cancel (runtime=`declared`)
- `IngredientDemandConfirmed->PurchaseNeed.create` → PurchaseNeed.create (runtime=`runtime_proven`)
- `VendorOrderSubmitted->PurchaseNeed.markDraftOrdered` → PurchaseNeed.markDraftOrdered (runtime=`declared`)

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
