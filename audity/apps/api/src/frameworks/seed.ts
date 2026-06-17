import { syncFrameworkYamlFiles } from "./yamlImporter.js";

export async function seedFrameworks(): Promise<void> {
  const result = await syncFrameworkYamlFiles({ force: true });
  if (result.errors.length > 0) {
    const details = result.errors.map((error) => `${error.file}: ${error.message}`).join("; ");
    throw new Error(`Framework YAML seed failed: ${details}`);
  }
  if (result.scannedFiles === 0) {
    throw new Error(`Framework YAML seed failed: no YAML files found in ${result.directory}`);
  }
}
