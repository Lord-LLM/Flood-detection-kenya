const fs = require("fs");
const path = require("path");

const token = process.env.MAPBOX_ACCESS_TOKEN || "";
const outputPath = path.join(__dirname, "config", "keys.local.js");
const contents = `// Generated at build time. Do not commit this file.\nwindow.FLOOD_CONFIG_KEYS = {\n  MAPBOX_ACCESS_TOKEN: ${JSON.stringify(token)}\n};\n`;

fs.writeFileSync(outputPath, contents, "utf8");
console.log(`Generated ${path.relative(__dirname, outputPath)}`);