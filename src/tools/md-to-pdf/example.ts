/**
 * Sample document for the "Load example" button. Exercises every construct
 * the parser supports, so it doubles as a visible statement of scope: what
 * is not in here is not supported.
 *
 * Fictional throughout — reserved example.com domains, no real people or
 * organisations. See the catalog convention on placeholder copy.
 */
export const EXAMPLE_MARKDOWN = `# Quarterly Field Report

A short document showing what this tool renders. Everything below is
fictional.

## Summary

The **northern route** survey finished ahead of schedule. Coverage rose to
_94%_, and the two outstanding gaps are now scheduled for the next window.

> Field note: the eastern ridge is still unreachable after heavy rain.
> Re-survey once the access track dries out.

## Findings

1. Signal coverage improved across all three corridors.
2. Two relay masts need replacement hardware.
3. Battery life on the older units drops sharply below freezing.

### Outstanding items

- Replace the mast at waypoint 14
- Re-survey the eastern ridge
  - Requires dry access track
  - Allow two full days
- File the updated coverage map

## Measurements

| Corridor | Coverage | Change | Status |
| :------- | -------: | -----: | :----: |
| North    |      94% |    +6% |   OK   |
| Central  |      88% |    +2% |   OK   |
| East     |      61% |    -1% | Review |

## Sample configuration

The survey units read a small config file at boot:

\`\`\`json
{
  "interval_seconds": 300,
  "corridors": ["north", "central", "east"],
  "retry": { "attempts": 3, "backoff": "exponential" }
}
\`\`\`

Set \`interval_seconds\` no lower than 120 — below that the units drain
their batteries before the collection window closes.

## References

See [the survey handbook](https://example.com/handbook) for the full
methodology, or write to [surveys@example.org](mailto:surveys@example.org)
with corrections.

---

*Prepared by the field team. Figures are provisional until the coverage map
is filed.*
`;
