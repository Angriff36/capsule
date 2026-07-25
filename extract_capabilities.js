const fs = require("fs");
const contract = JSON.parse(fs.readFileSync("wiring/contract.json", "utf8"));
const capabilities = contract.capabilities;

const capabilityData = capabilities.map((cap) => ({
  capability_id: cap.capabilityId,
  entity: cap.entity,
  command: cap.command,
  emits: cap.emits || [],
  parameters: cap.parameters || [],
  clientParameterNames: cap.clientParameterNames || [],
  serverParameterNames: cap.serverParameterNames || [],
}));

fs.writeFileSync(
  "capabilities_data.json",
  JSON.stringify(capabilityData, null, 2),
);
console.log(`Extracted ${capabilityData.length} capabilities`);
