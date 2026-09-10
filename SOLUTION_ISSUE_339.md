# Solution for Issue #339

## 🛠️ Proposed Solution (by Aditya Waghamare)

### Analysis
When a recipe template (`DishTask`) is updated (serving quantity, ingredients, name, instructions), existing event prep instances fail to propagate these updates or synchronize correctly. Specifically:
1. Event prep quantities remain decoupled from template serving updates.
2. Manual reconciliation partially syncs quantities while dropping updated ingredient, name, and instruction references.
3. Retiring the template leaves pending prep orphaned with disconnected status checks.

Root cause: The event prep instances reference snapshot copies or lack a cascading propagation mechanism and state-linkage listener connecting active `DishTask` revision IDs to scheduled event prep dependencies.

### Fix
Implement a reactive cascade mechanism within the recipe template service/mutator to ensure that editing a recipe template propagates non-destructive updates to pending/active event prep instances and correctly links or flags structural modifications (name, replacement ingredients, serving size scaling).

### Implementation
```typescript
// Proposed patch in capsule recipe/event coordination service
export interface RecipeTemplateRevisionOptions {
  cascadeToPendingPreps?: boolean;
  preserveCompletedHistory?: boolean;
}

export async function reviseRecipeTemplate(
  templateId: string,
  updatedData: Partial<DishTaskTemplate>,
  options: RecipeTemplateRevisionOptions = { cascadeToPendingPreps: true, preserveCompletedHistory: true }
): Promise<TemplateRevisionResult> {
  const existingTemplate = await getDishTaskTemplate(templateId);
  if (!existingTemplate) throw new Error(`Template ${templateId} not found`);

  // 1. Apply version bump / revision
  const newRevisionId = generateRevisionId();
  const revisedTemplate = {
    ...existingTemplate,
    ...updatedData,
    revisionId: newRevisionId,
    updatedAt: new Date().toISOString(),
  };

  await saveDishTaskTemplate(revisedTemplate);

  // 2. Cascade updates to associated active/pending event preps if requested
  if (options.cascadeToPendingPreps) {
    const linkedPreps = await findEventPrepsByTemplateId(templateId, { status: 'pending' });
    
    for (const prep of linkedPreps) {
      const scaledQuantity = revisedTemplate.servingSize * prep.servingCount;
      
      await updateEventPrep(prep.id, {
        recipeRevisionId: newRevisionId,
        name: revisedTemplate.name,
        ingredients: revisedTemplate.ingredients,
        instructions: revisedTemplate.instructions,
        quantity: scaledQuantity,
        syncStatus: 'synchronized',
      });
    }
  }

  // 3. Handle retirement linkage
  if (updatedData.status === 'retired') {
    await handleTemplateRetirement(templateId);
  }

  return {
    templateId,
    revisionId: newRevisionId,
    updatedPrepsCount: options.cascadeToPendingPreps ? linkedPreps.length : 0,
  };
}

async function handleTemplateRetirement(templateId: string): Promise<void> {
  const pendingPreps = await findEventPrepsByTemplateId(templateId, { status: 'pending' });
  for (const prep of pendingPreps) {
    // Flag or gracefully resolve orphaned pending prep without hard-deleting completed records
    await updateEventPrep(prep.id, {
      syncStatus: 'orphaned_template_retired',
      requiresManualReview: true,
    });
  }
}
```

### Testing
1. Create a DishTask template at 0.1875 lb/serving with initial ingredient/instruction and add to an event at 100 servings.
2. Revise the template to 0.25 lb/serving, new ingredient, and updated name/instruction.
3. Verify event prep automatically recalculates quantity to 25 lb and synchronizes ingredient/name/instruction updates without touching completed historical records.
4. Retire template and verify pending prep status correctly flags `orphaned_template_retired` and triggers review alerts.

Signed-off-by: Aditya Waghamare <adityawaghamare7620@gmail.com>


---
*Submitted by Aditya Waghamare*
💰 **Payout Address (Base L2 / EVM):** `0xb61dBcdBc3407F71EaCb64D4CBFAcf9FFfe2415C`