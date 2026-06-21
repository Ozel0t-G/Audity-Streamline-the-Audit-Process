import { loadConfig } from "../config.js";
import { keyToPhrase, fingerprintFromKey, formatPhraseForPrint } from "../auth/recoveryPhrase.js";

const config = loadConfig();
const phrase = keyToPhrase(config.encryptionKey);
const fingerprint = fingerprintFromKey(config.encryptionKey);

const lines = formatPhraseForPrint(phrase);
const sep = "=".repeat(64);
console.log("");
console.log("Audity instance recovery phrase");
console.log(sep);
console.log("");
for (const line of lines) console.log(`  ${line}`);
console.log("");
console.log(`  Fingerprint: ${fingerprint.match(/.{2}/g)!.join(" ")}`);
console.log("");
console.log(sep);
console.log("");
console.log("⚠  Store this phrase securely (password manager, safe, printed envelope).");
console.log("   Without it, encrypted archives and backups cannot be restored after");
console.log("   a fresh installation. This print contains the FULL key material —");
console.log("   anyone with these 72 hex chars can decrypt your archives.");
console.log("");
