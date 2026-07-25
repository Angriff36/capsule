const fs = require("fs");
const glob = require("glob");

// Load capabilities
const capabilities = JSON.parse(
  fs.readFileSync("capabilities_data.json", "utf8"),
);

// Get feature files (manually since glob might not work)
const path = require("path");
const featureFiles = [];

// Read directory recursively
function readDirRecursive(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && !filePath.includes("node_modules")) {
      readDirRecursive(filePath, fileList);
    } else if (filePath.match(/\.(ts|tsx)$/)) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

try {
  const files = readDirRecursive("src/features");
  console.log(`Found ${files.length} feature files`);

  // Search for capability implementations
  const implementations = {};

  files.forEach((file) => {
    try {
      const content = fs.readFileSync(file, "utf8");

      capabilities.forEach((cap) => {
        const { entity, command, capability_id } = cap;

        // Check for implementation patterns
        const patterns = [
          `api.${entity.toLowerCase()}.${command}`,
          `${entity}.${command}`,
          capability_id,
        ];

        patterns.forEach((pattern) => {
          if (content.includes(pattern)) {
            if (!implementations[capability_id]) {
              implementations[capability_id] = {
                capability_id,
                entity,
                command,
                files: [],
              };
            }
            if (!implementations[capability_id].files.includes(file)) {
              implementations[capability_id].files.push(file);
            }
          }
        });
      });
    } catch (err) {
      // Skip files that can't be read
    }
  });

  fs.writeFileSync(
    "ui_implementations.json",
    JSON.stringify(implementations, null, 2),
  );
  console.log(
    `Found implementations for ${Object.keys(implementations).length} capabilities`,
  );
} catch (err) {
  console.error(`Error: ${err.message}`);
}
