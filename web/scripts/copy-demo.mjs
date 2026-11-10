// Copies the shared demo backend from the main app into public/legacy/ before dev/build,
// so the old app and DineOS run one and the same demo (demo.js is the single source).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const root = new URL("../../", import.meta.url), out = new URL("../public/legacy/", import.meta.url);
mkdirSync(out, { recursive: true });
const api = readFileSync(new URL("api.js", root), "utf8");
const shim = api.split("const API =")[0];       // store, newRequestId, Money
if (!shim.includes("const Money")) throw new Error("api.js changed: shim not found");
writeFileSync(new URL("shim.js", out), shim + "\nwindow.Money = Money;\n");
writeFileSync(new URL("demo.js", out), readFileSync(new URL("demo.js", root), "utf8") + "\nwindow.Demo = Demo;\n");
console.log("demo backend copied to public/legacy/");
