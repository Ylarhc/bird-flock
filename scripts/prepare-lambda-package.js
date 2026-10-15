const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");

fs.copyFileSync(path.join(root, "package.json"), path.join(dist, "package.json"));
fs.copyFileSync(path.join(root, "package-lock.json"), path.join(dist, "package-lock.json"));
fs.copyFileSync(path.join(root, "headtohead.json"), path.join(dist, "headtohead.json"));

execSync("npm ci --omit=dev", { cwd: dist, stdio: "inherit" });
