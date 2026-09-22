# jev-langgraph-router

LangGraph.js conditional-edge adapter for Jev. This package remains private until the live Jev
contract and benchmark release gates are complete.

```ts
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { createJevRouter } from "jev-langgraph-router";

const State = Annotation.Root({
  message: Annotation<string>,
  customerId: Annotation<string>,
  result: Annotation<string>,
});

const route = createJevRouter({
  routes: {
    answer: "Answer without current information",
    search: "Find current or external information",
    human: "Request human review",
  },
  selectState: (state: { message: string; customerId: string }) => ({
    message: state.message,
  }),
  minimumProbability: 0.9,
  minimumConfidence: 0.6,
  fallback: "human",
});

const graph = new StateGraph(State)
  .addNode("classify", () => ({}))
  .addNode("answer", () => ({ result: "answered" }))
  .addNode("search", () => ({ result: "searched" }))
  .addNode("human", () => ({ result: "needs review" }))
  .addEdge(START, "classify")
  .addConditionalEdges("classify", route, ["answer", "search", "human"])
  .addEdge("answer", END)
  .addEdge("search", END)
  .addEdge("human", END)
  .compile();
```

`selectState` is required so the application controls which graph fields are sent to Jev. The
fallback route must be one of the declared routes. A caller may inject an evaluator to run graph
tests without network access. `onDecision` can record the final decision without receiving graph
state; observer errors do not affect routing.
