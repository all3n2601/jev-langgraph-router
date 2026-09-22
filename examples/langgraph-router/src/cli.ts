import { createDemoGraph, offlineEvaluator } from "./graph.js";

const args = process.argv.slice(2);
const live = args.includes("--live");
const messageIndex = args.indexOf("--message");
const message = messageIndex === -1 ? "What is the weather today?" : args[messageIndex + 1];

if (message === undefined || message.trim().length === 0) {
  throw new Error("Pass nonempty text after --message");
}
if (live && !process.env.TYPESAFE_API_KEY?.trim()) {
  throw new Error("Set TYPESAFE_API_KEY in the ignored root .env file for --live");
}

const graph = createDemoGraph({
  ...(live ? {} : { evaluator: offlineEvaluator }),
});
const result = await graph.invoke({
  message,
  privateNote: "This field stays local and is never projected to Jev.",
});
console.log(
  JSON.stringify(
    { mode: live ? "live" : "offline", selectedRoute: result.selectedRoute, output: result.output },
    null,
    2,
  ),
);
