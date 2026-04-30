#!/usr/bin/env node

const { spawn } = require("child_process");
const process = require("process");

const PORT = process.env.PORT || 5173;

async function main() {
  try {
    console.log("Starting Vite dev server on port", PORT);

    const viteProcess = spawn("npm", ["run", "dev"], {
      stdio: "inherit",
      shell: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log("\nConnecting ngrok tunnel...");

    const ngrokProcess = spawn("npx", ["ngrok", "http", PORT.toString()], {
      stdio: "inherit",
      shell: true,
    });

    console.log("ngrok inspection UI: http://localhost:4040");
    console.log("Press Ctrl+C to stop\n");

    const cleanup = () => {
      console.log("\nShutting down...");
      ngrokProcess.kill();
      viteProcess.kill();
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    viteProcess.on("exit", () => {
      ngrokProcess.kill();
      process.exit(0);
    });
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
