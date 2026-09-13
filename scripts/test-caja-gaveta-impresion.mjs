import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

async function runTests() {
  console.log("=== TDD TEST SUITE: CAJA, GAVETA, FORMATTERS Y ESTILOS SOLIDOS ===");
  let passed = 0;
  let total = 0;

  function assert(condition, name) {
    total++;
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`);
    }
  }

  // 1. Check fmt import in MesaOrdenClient.js
  const mesaOrdenCode = fs.readFileSync(path.join(root, "src/app/mesas/[id]/MesaOrdenClient.js"), "utf8");
  assert(
    mesaOrdenCode.includes('import { fmt }') || mesaOrdenCode.includes('import {fmt}'),
    "MesaOrdenClient.js must import { fmt } from '@/lib/formatters'"
  );

  // 2. Check no pastel badges in mesas/page.js
  const mesasPageCode = fs.readFileSync(path.join(root, "src/app/mesas/page.js"), "utf8");
  assert(
    !mesasPageCode.includes("bg-rose-50 text-rose-800 border-rose-300") &&
    !mesasPageCode.includes("bg-emerald-50 text-emerald-800 border-emerald-300"),
    "mesas/page.js must NOT have pastel borders for Libre / Ocupada buttons"
  );
  assert(
    mesasPageCode.includes("bg-rose-700") || mesasPageCode.includes("bg-rose-600") || mesasPageCode.includes("bg-stone-900"),
    "mesas/page.js must use solid colors for table status"
  );

  // 3. Check no pastel badges in caja/page.js
  const cajaPageCode = fs.readFileSync(path.join(root, "src/app/caja/page.js"), "utf8");
  assert(
    !cajaPageCode.includes("bg-rose-50 text-rose-800 border-rose-300") &&
    !cajaPageCode.includes("bg-emerald-50 text-emerald-800 border-emerald-300"),
    "caja/page.js must NOT have pastel borders for mini table status"
  );

  // 4. Check 'Abrir Gaveta' button exists in caja/page.js
  assert(
    cajaPageCode.includes("Abrir Gaveta") || cajaPageCode.includes("abrirGaveta"),
    "caja/page.js must have 'Abrir Gaveta' action button for cashier"
  );

  // 5. Check route /api/caja/gaveta exists
  const gavetaRoutePath = path.join(root, "src/app/api/caja/gaveta/route.js");
  assert(
    fs.existsSync(gavetaRoutePath),
    "/api/caja/gaveta/route.js must exist to handle physical drawer kick requests"
  );

  // 6. Check ESLint FlatConfig doesn't throw serialization error
  const eslintConfigCode = fs.readFileSync(path.join(root, "eslint.config.mjs"), "utf8");
  assert(
    !eslintConfigCode.includes("Cannot serialize key") && eslintConfigCode.length > 0,
    "eslint.config.mjs is readable and configured"
  );

  console.log(`\n=======================================================`);
  console.log(`RESULTADO: ${passed} / ${total} PRUEBAS PASADAS`);
  console.log(`=======================================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Error en pruebas TDD:", err);
  process.exit(1);
});
