# coding-goal-verify

Isolated fixture repository for a DSH goal-mode + Coding closed-loop
verification. Nothing here is production code.

`src/invoice.mjs` is an integer-cents invoice helper. Its documented contract is
in the source comments; `tools/accept.mjs` is the acceptance command and
`npm test` is the repository unit suite.

```sh
npm test        # unit suite
npm run accept  # acceptance command (the gate)
```

The defect under test is real: the current implementation violates the
documented rounding and remainder-allocation contract, and `npm run accept`
fails.
