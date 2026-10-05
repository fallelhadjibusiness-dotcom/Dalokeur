import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
process.env.UPLOAD_DIR = ".uploads-test"; // les tests n'écrivent jamais dans le vrai dossier de stockage
process.env.STORAGE_DRIVER = "local";
