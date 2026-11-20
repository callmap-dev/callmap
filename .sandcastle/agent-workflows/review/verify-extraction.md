Emit a single `<output>` block as the last thing in your response.

Do not change files.
Do not run commands.
Do not include text outside the `<output>` block.

```json
<output>
{
  "verdicts": [
    { "claim": 1, "verdict": "confirmed", "evidence": "The input or the call path that shows the defect" }
  ]
}
</output>
```

Give one verdict for each claim, with the claim number. The verdict is `confirmed`, `refuted` or `pre-existing`.
