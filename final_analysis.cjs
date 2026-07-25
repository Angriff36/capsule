const fs = require("fs");

// Load capabilities
const capabilities = JSON.parse(
  fs.readFileSync("capabilities_data.json", "utf8"),
);

// Load UI implementations
const uiImpl = JSON.parse(fs.readFileSync("ui_implementations.json", "utf8"));
const implementedCapabilities = new Set(Object.keys(uiImpl));

// Analyze ownership patterns
const ownershipPatterns = {
  clientOnly: [],
  serverOnly: [],
  mixed: [],
};

// Create final dataset
const finalData = capabilities.map((cap) => {
  const {
    capability_id,
    entity,
    command,
    emits,
    parameters,
    clientParameterNames,
    serverParameterNames,
  } = cap;

  // Determine ownership pattern
  let ownershipPattern = "clientOnly";
  if (clientParameterNames.length > 0 && serverParameterNames.length > 0) {
    ownershipPattern = "mixed";
  } else if (
    serverParameterNames.length > 0 &&
    clientParameterNames.length === 0
  ) {
    ownershipPattern = "serverOnly";
  }

  // Track patterns
  if (!ownershipPatterns[ownershipPattern].includes(capability_id)) {
    ownershipPatterns[ownershipPattern].push(capability_id);
  }

  const has_ui = implementedCapabilities.has(capability_id);
  const uiFiles = has_ui ? uiImpl[capability_id].files : [];

  return {
    capability_id,
    entity,
    command,
    has_ui,
    ui_file_path: has_ui ? uiFiles.join(", ") : "",
    ownership_summary: `${ownershipPattern} (${clientParameterNames.length} client, ${serverParameterNames.length} server)`,
    emits: emits.join(", ") || "none",
    total_parameters: parameters.length,
    client_params: clientParameterNames.join(", ") || "none",
    server_params: serverParameterNames.join(", ") || "none",
  };
});

// Generate summary statistics
const summary = {
  total_capabilities: finalData.length,
  with_ui: finalData.filter((c) => c.has_ui).length,
  without_ui: finalData.filter((c) => !c.has_ui).length,
  ownership_patterns: {
    client_only: ownershipPatterns.clientOnly.length,
    server_only: ownershipPatterns.serverOnly.length,
    mixed: ownershipPatterns.mixed.length,
  },
  entities: [...new Set(finalData.map((c) => c.entity))].length,
  commands: [...new Set(finalData.map((c) => c.command))].length,
};

fs.writeFileSync(
  "final_capabilities_analysis.json",
  JSON.stringify(
    {
      summary,
      capabilities: finalData,
    },
    null,
    2,
  ),
);

console.log("Analysis complete:");
console.log(`- Total capabilities: ${summary.total_capabilities}`);
console.log(`- With UI: ${summary.with_ui}`);
console.log(`- Without UI: ${summary.without_ui}`);
console.log(
  `- Ownership patterns: ${JSON.stringify(summary.ownership_patterns)}`,
);
