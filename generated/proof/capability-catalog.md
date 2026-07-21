# Manifest capability catalog

- Schema: `manifest-capability-catalog/v1`
- Manifest: `3.6.41`
- Projection: `convex`
- Preset: `convex-application@1.3.5`
- IR hash: `153be5b9b94014082c2ecf3f789a56a5f5341623eb666b714a7044232174a257:1ab6083e1a469f8aaf08104169ae3d9a1ca53a91770df4a6ef4e57bfa05c6a10:1e506668fbefd709f384af429ccf3b970daf7143b943b29219c7229605c90f97:21d57d616e827ed9eba8950af310277f2eb66471f5fba0eb3107b6da20518a15:317bb23515379f8c3797f3065e69af8d8ea35f013bcf07410205891f51cb2b71:444a34406a1be59e2318e52618f06e2c024cc5f4b8539eaad99e8688068b5ba0:44817c0e4d994b4f9eaaec0ff77a7354d8c429d3ff64ed2ed697a04afa1ecc61:4b3a8bb3b8a0100eb0c02aea49d373e01fa7f0e403a9d707dc9dc9766112663f:5111ecb9c8543db2375be26fff8638deafdd1c5aeebe5eb098383347a0252960:521cdeef965c39fc3dcb888dfe409087134b9e4fb88195a97285eee2d187fd29:61fee74be61813476c9563e3efbd2e0bb8567052cdc4a9ecdae853f68c6c6a3a:77766fdde34e6bfb38efd3184bf84bf99af350cfcdf58cabbbd913f0a73037b8:7b2cc0e31b7c4c06582c7a72587c5c3782c0bf4344483952e25d8c01315e541c:7b55a406b8fcf935714eb9636512d7c46b73211747ffbb1dd39628d50f256e68:827f770b97190c87315c820e96bd13d93fbc66a3fe633a257a0f0938f73543d6:8d3397fc8c4a274927af3f654a36b9318b077aaca2262d574e8325b167c138fb:91013449fb5b6d6f2dcd45746d7b46bbda19031e1d6da873e2d4e9c02821c560:91fd78bcaab65af1e80ac79531842df3f3bc3ae121aedb26189b0c93850883ea:952203740dd05c52a2ee55ca78f80b811be3bb48449b03126e87f3171ef3179d:96b5958136a1a09ee039422008844ec9239f72349635f56a5a46ecb6a8b45740:96ee313de3f29c419df911bc0b8e5f39b5fde7e44ab2e1921fff9af829f6bfb9:99966b159339ed3d6cc1a24f287d64c5be13db08bbf07c6fb855b352c9c256e4:9bd7fd575269fab78b265cc37ab2403ee389301a73457196d27e730ee6700254:a55d023b26a6299c99c87138658384e8f97eb636a0cabeeb80ff159c6a9d1c45:a75dc45988f7fcf22fc8397fd340666ff31cde4af8653c561f65d43ff418898d:b42238d427001b39dbfbd3becd1f66b96f676331afc164c7ccd1209349510271:baf09f81826c20997d670f15d16728a5ff0aa7dc6a9972bb005ceead8bf7433f:bca45b4a706c571e4061fb9a8131be61278b265eea1cf2f4381f27e5a1d638df:c91413f626012769224ca1ab08abe6469f993619bc17a22e6bcd686926832d79:cd648a831023e2befe3dc8a1d9e9e58dc11b27477ee7df4156733631bed767eb:cfa8c6c27621f38fe254c8657e8c8215fcdcb6e1ef47b0d6308bf34f436af3b2:d42158155248e729c7f6c0d953412b64694a10568af4ee4ba1b9885104915afc:d734ba9287bb449fad867011f13ea06e9ed4ea523f81065b1788aa578732e6b8:dcc4e69c9df237e5972ba749c7e1e76525f0d181301b8d8c2b437cf8eaede1dd:e2230c0ce31b04ea452a5349be34a5841703e415f46c8d0e2f7f1afb914a1761:e542220c6e01b1cde78d80d483bde5d7be7c513aa50cb188a1b61852a2e9d441:ea8e764f3555eee1381b681fba30974755c9317d22b80db43cc44fd691eb6368:f22810fa49283ef6682ac632621533b3b2d72d92f59e7f47285a2881d1b7ecaf:f688898cf4c0c68871d41e91b8f5999fcde4faf80d7703a080841d3e90649720:fdc28fad241416ceed92a345c3acf5b15954417bb2bda3075aff77e7beebeb45`

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

## EventCloseout

- Table: `eventCloseouts`
- List: `listEventCloseout`
- Detail: `getEventCloseout`
- Create: `EventCloseout_createViaCapture` / `useCreateEventCloseout`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `financeAccess`

### Commands
- `EventCloseout_capture` emits EventCloseoutCaptured
- `EventCloseout_finalize` emits EventCloseoutFinalized

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
- `Ingredient_setPreferredVendor`
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
- `IngredientDemand_ensurePurchaseEligible`
- `IngredientDemand_fulfill` emits IngredientDemandFulfilled
- `IngredientDemand_markReleased` emits IngredientDemandReleased
- `IngredientDemand_recalculate` emits IngredientDemandRecalculated
- `IngredientDemand_supersede` emits IngredientDemandSuperseded
- `IngredientDemand_syncFromContributions` emits IngredientDemandCalculated

### Reactions
- `EventApproved->IngredientDemand.ensurePurchaseEligible` → IngredientDemand.ensurePurchaseEligible (runtime=`declared`)
- `EventIngredientContributionRecorded->IngredientDemand.syncFromContributions` → IngredientDemand.syncFromContributions (runtime=`declared`)
- `IngredientDemandCalculated->PurchaseNeed.reviseRequired` → PurchaseNeed.reviseRequired (runtime=`declared`)
- `IngredientDemandConfirmed->PurchaseNeed.create` → PurchaseNeed.create (runtime=`runtime_proven`)
- `PurchaseNeedOpened->IngredientDemand.markReleased` → IngredientDemand.markReleased (runtime=`declared`)

## Invoice

- Table: `invoices`
- List: `listInvoice`
- Detail: `getInvoice`
- Create: `Invoice_createViaIssue` / `useCreateInvoice`
- Proof: structural=`generated` runtime=`runtime_proven`
- Capabilities: `financeAccess`

### Commands
- `Invoice_applyPayment` emits InvoicePaymentApplied
- `Invoice_issue` emits InvoiceIssued
- `Invoice_markOverdue` emits InvoiceMarkedOverdue
- `Invoice_markViewed` emits InvoiceViewed
- `Invoice_markVoided` emits InvoiceVoided
- `Invoice_recordRefund` emits InvoiceRefundRecorded
- `Invoice_send` emits InvoiceSent
- `Invoice_writeOff` emits InvoiceWrittenOff

### Reactions
- `EventCancelled->Invoice.markVoided` → Invoice.markVoided (runtime=`declared`)
- `PaymentSettled->Invoice.applyPayment` → Invoice.applyPayment (runtime=`runtime_proven`)

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

## Payment

- Table: `payments`
- List: `listPayment`
- Detail: `getPayment`
- Create: `Payment_createViaRecord` / `useCreatePayment`
- Proof: structural=`generated` runtime=`runtime_proven`
- Capabilities: `financeAccess`

### Commands
- `Payment_beginProcessing` emits PaymentProcessingStarted
- `Payment_fail` emits PaymentFailed
- `Payment_record` emits PaymentRecorded
- `Payment_refund` emits PaymentRefunded
- `Payment_settle` emits PaymentSettled

### Reactions
- `PaymentSettled->Invoice.applyPayment` → Invoice.applyPayment (runtime=`runtime_proven`)

## PayrollInput

- Table: `payrollInputs`
- List: `listPayrollInput`
- Detail: `getPayrollInput`
- Create: `PayrollInput_createViaPrepare` / `useCreatePayrollInput`
- Proof: structural=`generated` runtime=`declared`
- Capabilities: `financeManageAccess`

### Commands
- `PayrollInput_finalize` emits PayrollInputFinalized
- `PayrollInput_markVoided` emits PayrollInputVoided
- `PayrollInput_prepare` emits PayrollInputPrepared

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
- Capabilities: `inventoryAccess`, `manageAccess`

### Commands
- `PurchaseNeed_assignToDraft` emits PurchaseNeedDraftAssigned
- `PurchaseNeed_cancel` emits PurchaseNeedCancelled
- `PurchaseNeed_create` emits PurchaseNeedOpened
- `PurchaseNeed_markDraftOrdered` emits PurchaseNeedOrdered
- `PurchaseNeed_markFulfilled` emits PurchaseNeedFulfilled
- `PurchaseNeed_markOrdered` emits PurchaseNeedOrdered
- `PurchaseNeed_reviseRequired` emits PurchaseNeedOpened

### Reactions
- `EventApproved->PurchaseNeed.create` → PurchaseNeed.create (runtime=`declared`)
- `EventCancelled->PurchaseNeed.cancel` → PurchaseNeed.cancel (runtime=`declared`)
- `IngredientDemandCalculated->PurchaseNeed.reviseRequired` → PurchaseNeed.reviseRequired (runtime=`declared`)
- `IngredientDemandConfirmed->PurchaseNeed.create` → PurchaseNeed.create (runtime=`runtime_proven`)
- `PurchaseNeedOpened->IngredientDemand.markReleased` → IngredientDemand.markReleased (runtime=`declared`)
- `PurchaseNeedOpened->WeeklyPurchasingConfig.routeNeed` → WeeklyPurchasingConfig.routeNeed (runtime=`declared`)
- `VendorOrderLineWeeklyEnsured->PurchaseNeed.assignToDraft` → PurchaseNeed.assignToDraft (runtime=`declared`)
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
