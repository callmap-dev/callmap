Emit a single `<output>` block as the last thing in your response.

Do not change files.
Do not run commands.
Do not include text outside the `<output>` block.

```json
<output>
{
  "summary": "The acceptance-criteria checklist, then 1-3 paragraphs explaining your review, including what you changed or why it was already clean.",
  "specConformant": true,
  "unmetCriteria": ["Each acceptance criterion from the linked issue that the branch still does not meet; empty when specConformant is true"],
  "needsChanges": false,
  "inlineComments": [
    { "path": "relative/file.ts", "line": 123, "body": "Markdown comment" }
  ],
  "replies": [
    { "commentId": "GraphQL node id from PR_COMMENTS_JSON", "body": "Markdown reply" }
  ]
}
</output>
```

Use empty arrays when there are no inline comments or replies.

Set `needsChanges` to true only when an inline comment asks for a code change that the review did not make itself. A comment that only explains a change the review made, or a question with no requested change, keeps it false.
