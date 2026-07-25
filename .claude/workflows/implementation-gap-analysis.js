export const meta = {
  name: "implementation-gap-analysis",
  description:
    "Analyze specs vs source code to identify implementation gaps and update IMPLEMENTATION_PLAN.md",
  phases: [
    { title: "Spec Study", detail: "Read and digest complete feature spec" },
    {
      title: "Wiring Study",
      detail: "Understand shared utilities and components",
    },
    {
      title: "Feature Analysis",
      detail: "Parallel analysis of each feature directory",
    },
    {
      title: "Gap Consolidation",
      detail: "Opus analysis of findings and prioritization",
    },
    { title: "Plan Update", detail: "Generate updated IMPLEMENTATION_PLAN.md" },
  ],
};

// First, read the spec and wiring to understand requirements
phase("Spec Study");

const specPath = "specs/capsule-complete-feature-spec.md";

const specAnalysis = await agent(
  `
Read the complete feature specification at ${specPath} and produce a structured breakdown:

1. List ALL entities referenced in the spec (with their sections)
2. List ALL features/user flows (with their sections)
3. List ALL integrations (with their sections)
4. List ALL dashboards/reports (with their sections)
5. Extract the priority/slice structure from the spec

Format as JSON with these fields:
- entities: [{name, section, requiredFields, status}]
- features: [{name, section, description, status}]
- integrations: [{name, section, provider, status}]
- dashboards: [{name, section, metrics, status}]
- slices: [{name, priority, items}]

This is the specification reference only - do NOT check if code exists yet.
`,
  {
    schema: {
      type: "object",
      properties: {
        entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              section: { type: "string" },
              requiredFields: { type: "string" },
              status: { type: "string" },
            },
          },
        },
        features: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              section: { type: "string" },
              description: { type: "string" },
              status: { type: "string" },
            },
          },
        },
        integrations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              section: { type: "string" },
              provider: { type: "string" },
              status: { type: "string" },
            },
          },
        },
        dashboards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              section: { type: "string" },
              metrics: { type: "string" },
              status: { type: "string" },
            },
          },
        },
        slices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              priority: { type: "number" },
              items: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    phase: "Spec Study",
    label: "spec-breakdown",
  },
);

phase("Wiring Study");

const wiringAnalysis = await agent(
  `
Study the wiring/contract.json file and any shared utilities it references.

Provide:
1. Summary of what wiring/contract.json defines
2. List of shared components/utilities available
3. Any integration patterns defined

This helps understand what shared infrastructure exists before analyzing features.
`,
  { phase: "Wiring Study", label: "wiring-analysis" },
);

phase("Feature Analysis");

// Feature directories to analyze
const featureDirs = [
  "src/features/clients",
  "src/features/events",
  "src/features/finance",
  "src/features/kitchen",
  "src/features/logistics",
  "src/features/inventory",
  "src/features/workforce",
  "src/features/admin",
  "src/features/reports",
  "src/features/production",
  "src/features/announcements",
  "src/features/attachments",
  "src/features/clientPortal",
  "src/features/home",
  "src/features/facilities",
  "src/features/integrations",
];

log(`Analyzing ${featureDirs.length} feature directories in parallel...`);

// Analyze each feature directory in parallel
const featureResults = await pipeline(featureDirs, async (featureDir) => {
  const dirName = featureDir.split("/").pop();
  const result = await agent(
    `
Analyze the feature directory at ${featureDir}/

Your task: Determine what IS implemented vs what the spec requires.

For this feature:
1. List ALL files found (tsx, ts, in subdirectories)
2. List ALL entities/data models referenced (from imports, convex queries, types)
3. List ALL user flows/operations that have UI pages
4. List ALL commands/mutations used
5. List any TODO comments or placeholder implementations

Search patterns:
- Look for manifest imports: from 'convex/_generated/...' or '../schema'
- Look for entity usage patterns
- Check for TODO, FIXME, placeholder, stub comments
- Check for incomplete implementations (empty functions, return statements)

Output JSON:
{
  "directory": "${featureDir}",
  "files": ["string list"],
  "entities": ["string list of entity names"],
  "uiPages": ["string list of page components"],
  "commands": ["string list of mutations used"],
  "todos": ["string list of TODO/FIXME/placeholder comments"],
  "completeness": "number 0-100 estimated",
  "gaps": ["string list of what appears missing"],
  "evidence": "string explanation with file:line references"
}
`,
    {
      schema: {
        type: "object",
        properties: {
          directory: { type: "string" },
          files: { type: "array", items: { type: "string" } },
          entities: { type: "array", items: { type: "string" } },
          uiPages: { type: "array", items: { type: "string" } },
          commands: { type: "array", items: { type: "string" } },
          todos: { type: "array", items: { type: "string" } },
          completeness: { type: "number" },
          gaps: { type: "array", items: { type: "string" } },
          evidence: { type: "string" },
        },
      },
      label: dirName,
      phase: "Feature Analysis",
    },
  );
  return { featureDir, result };
});

log(`Feature analysis complete. Consolidating findings...`);

phase("Gap Consolidation");

// Use Opus for deep analysis of all findings
const gapAnalysis = await agent(
  `
You are the implementation gap analyst. You have:

1. Specification breakdown:
${JSON.stringify(specAnalysis, null, 2)}

2. Feature analysis results:
${JSON.stringify(
  featureResults.map((f) => ({ dir: f.featureDir, data: f.result })),
  null,
  2,
)}

Your task: Perform a deep, thorough gap analysis.

For EACH spec item (entities, features, integrations, dashboards):
- Check if it exists in the feature analysis
- Determine if fully implemented, partial, or missing
- Assign a status: ✅ DONE, 🟡 PARTIAL, ❌ NOT BUILT
- Provide file:line evidence for your assessment

Then prioritize the gaps by:
1. Foundation dependencies (what blocks other work)
2. User-facing impact
3. Implementation effort

Output JSON:
{
  "summary": {
    "totalSpecItems": "number",
    "done": "number",
    "partial": "number",
    "notBuilt": "number",
    "overallCompleteness": "number 0-100"
  },
  "entities": [
    {
      "name": "string",
      "specSection": "string",
      "status": "DONE|PARTIAL|NOT_BUILT",
      "evidence": "string with file:line",
      "gaps": ["string list of what's missing"],
      "dependents": ["string list of what depends on this"]
    }
  ],
  "features": [
    {
      "name": "string",
      "specSection": "string",
      "status": "DONE|PARTIAL|NOT_BUILT",
      "evidence": "string with file:line",
      "gaps": ["string list"],
      "effort": "Small|Medium|Large|XLarge",
      "impact": "Low|Medium|High|Critical"
    }
  ],
  "integrations": [
    {
      "name": "string",
      "provider": "string",
      "status": "DONE|PARTIAL|NOT_BUILT",
      "evidence": "string",
      "gaps": ["string list"]
    }
  ],
  "dashboards": [
    {
      "name": "string",
      "status": "DONE|PARTIAL|NOT_BUILT",
      "evidence": "string",
      "gaps": ["string list"]
    }
  ],
  "prioritySequence": [
    {
      "rank": "number",
      "item": "string",
      "effort": "Small|Medium|Large|XLarge",
      "impact": "Low|Medium|High|Critical",
      "dependencies": ["string list"],
      "whyThisPriority": "string explanation"
    }
  ],
  "hiddenDependencies": [
    {
      "item": "string",
      "blocks": ["string list of what it blocks"],
      "explanation": "string"
    }
  ],
  "technicalDebt": [
    {
      "issue": "string",
      "location": "string file:line",
      "impact": "string",
      "suggestedFix": "string"
    }
  ]
}

Be THOROUGH. Check EVERY spec item. Provide SPECIFIC evidence.
`,
  {
    model: "opus",
    phase: "Gap Consolidation",
    schema: {
      type: "object",
      properties: {
        summary: {
          type: "object",
          properties: {
            totalSpecItems: { type: "number" },
            done: { type: "number" },
            partial: { type: "number" },
            notBuilt: { type: "number" },
            overallCompleteness: { type: "number" },
          },
        },
        entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              specSection: { type: "string" },
              status: {
                type: "string",
                enum: ["DONE", "PARTIAL", "NOT_BUILT"],
              },
              evidence: { type: "string" },
              gaps: { type: "array", items: { type: "string" } },
              dependents: { type: "array", items: { type: "string" } },
            },
          },
        },
        features: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              specSection: { type: "string" },
              status: {
                type: "string",
                enum: ["DONE", "PARTIAL", "NOT_BUILT"],
              },
              evidence: { type: "string" },
              gaps: { type: "array", items: { type: "string" } },
              effort: {
                type: "string",
                enum: ["Small", "Medium", "Large", "XLarge"],
              },
              impact: {
                type: "string",
                enum: ["Low", "Medium", "High", "Critical"],
              },
            },
          },
        },
        integrations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              provider: { type: "string" },
              status: {
                type: "string",
                enum: ["DONE", "PARTIAL", "NOT_BUILT"],
              },
              evidence: { type: "string" },
              gaps: { type: "array", items: { type: "string" } },
            },
          },
        },
        dashboards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              status: {
                type: "string",
                enum: ["DONE", "PARTIAL", "NOT_BUILT"],
              },
              evidence: { type: "string" },
              gaps: { type: "array", items: { type: "string" } },
            },
          },
        },
        prioritySequence: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rank: { type: "number" },
              item: { type: "string" },
              effort: {
                type: "string",
                enum: ["Small", "Medium", "Large", "XLarge"],
              },
              impact: {
                type: "string",
                enum: ["Low", "Medium", "High", "Critical"],
              },
              dependencies: { type: "array", items: { type: "string" } },
              whyThisPriority: { type: "string" },
            },
          },
        },
        hiddenDependencies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item: { type: "string" },
              blocks: { type: "array", items: { type: "string" } },
              explanation: { type: "string" },
            },
          },
        },
        technicalDebt: {
          type: "array",
          items: {
            type: "object",
            properties: {
              issue: { type: "string" },
              location: { type: "string" },
              impact: { type: "string" },
              suggestedFix: { type: "string" },
            },
          },
        },
      },
    },
  },
);

phase("Plan Update");

log("Generating updated IMPLEMENTATION_PLAN.md...");

// Generate the updated implementation plan
const planContent = await agent(
  `
You are the technical writer updating IMPLEMENTATION_PLAN.md.

You have the complete gap analysis:

${JSON.stringify(gapAnalysis, null, 2)}

And the existing plan at IMPLEMENTATION_PLAN.md.

Your task: Write the COMPLETE, UPDATED IMPLEMENTATION_PLAN.md that:

1. Starts with a summary section showing:
   - Changes this update (what changed vs last version)
   - Summary status by slice (table format)
   - Overall assessment paragraph

2. Detailed status by spec section:
   - Foundation Entities (§2.1-2.3)
   - Slice 0 — Foundation Blockers
   - Slice 1 — Proposal Wedge
   - Slice 2 — TPP Migration
   - Slice 3 — Venue and Reporting Core
   - Slice 4 — Operations
   - Slice 5 — Provider Integrations

3. For each item:
   - Status indicator (✅ DONE, 🟡 PARTIAL, ❌ NOT BUILT)
   - Evidence with file:line references
   - Specific gaps listed
   - Estimated effort
   - Dependencies
   - Next steps (if not done)

4. Cross-cutting concerns section

5. Priority sequencing section (table format)

6. Implementation notes

7. Bonus features discovered (beyond spec)

CRITICAL:
- Use EXACT file:line references from the analysis
- Be SPECIFIC about what's missing
- Include ALL items from the spec, not just new ones
- Maintain the structure and format of the existing plan
- Tables should have: Priority | Item | Effort | Impact | Why/Dependencies

Write the FULL markdown content for IMPLEMENTATION_PLAN.md

Return ONLY the markdown content (no wrapper text).
`,
  { model: "opus", phase: "Plan Update", label: "generate-plan" },
);

log("Writing IMPLEMENTATION_PLAN.md...");

return {
  specAnalysis,
  wiringAnalysis,
  featureAnalysis: featureResults.map((f) => ({
    dir: f.featureDir,
    completeness: f.result.completeness,
  })),
  gapAnalysis,
  planGenerated: true,
  planPreview: planContent.substring(0, 2000) + "...",
};
