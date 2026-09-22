# Runnable LangGraph router example

This compiled graph uses `createJevRouter()` to choose one of four next nodes: `answer`, `search`,
`calculate`, or `human`. It runs offline by default with a deterministic fixture, so no account
or API key is needed:

```sh
pnpm example:langgraph
pnpm example:langgraph -- --message "Calculate 17 multiplied by 23"
```

For one real Jev routing call, save `TYPESAFE_API_KEY` in the ignored root `.env` file and opt in:

```sh
pnpm example:langgraph:live --message "What is the weather today?"
```

Example output:

```json
{
  "mode": "offline",
  "selectedRoute": "search",
  "output": "Search node selected. Connect your search tool here."
}
```

The graph structure is:

```text
START -> classify -> Jev router -> answer ------> END
                                 -> search ------> END
                                 -> calculate ---> END
                                 -> human -------> END
```

`selectState` sends only the user message to Jev; the example's `privateNote` stays in the graph.
The `human` node is the declared fallback if the probability or confidence threshold is not met.
The branch nodes intentionally do not perform searches, calculations, approvals, or other side
effects. Replace their placeholder outputs with your own application tools after reviewing those
tools' safety and cost. Offline mode makes no network calls; live mode makes one Jev routing call
and may incur provider charges. See [`src/graph.ts`](./src/graph.ts) for the graph and
[`tests/graph.test.ts`](./tests/graph.test.ts) for executable fixtures.
