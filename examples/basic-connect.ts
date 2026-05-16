import { createPtero } from "../src/index.js";

const ptero = createPtero.fromEnv();
const result = await ptero.connect();

console.log(result);
