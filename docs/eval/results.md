# Evaluation results

Run: 2026-10-28 | Answer model: `nvidia/nemotron-3-super-120b-a12b` | Judge: `nvidia/Nemotron-3-Ultra-550b-a55b` | Embeddings: `Qwen/Qwen3-Embedding-8B` (512 dims) | Top-k: 4

**10/10 questions passed.** Retrieval on answerable questions: right document first for 7/7, within the top 4 for 7/7. Estimated cost of the whole run: about $0.0409.

**Judge check:** 3/3 deliberately wrong answers were flagged (not marked verified); 7/7 correct answers were marked verified.

Average time per question: 13050 ms in total (embed 8340 ms, answer 2985 ms, judge 1724 ms).

| Type | Passed |
|---|---|
| answerable | 7/7 |
| unanswerable | 1/1 |
| extraction | 1/1 |
| ambiguous | 1/1 |

| ID | Type | Result | Top-1 doc | In top-4 | Judge | Answer (ms) | Judge (ms) | Answer |
|---|---|---|---|---|---|---|---|---|
| q1 | answerable | pass | yes | yes | verified (5) | 7267 | 1434 | £569.00 [3] |
| q2 | answerable | pass | yes | yes | verified (5) | 1495 | 1786 | £455.20 [3] |
| q3 | answerable | pass | yes | yes | verified (5) | 4310 | 2450 | Each installment is £56.90 and there are 2 installments. [1] |
| q4 | answerable | pass | yes | yes | verified (5) | 1638 | 2253 | The new metformin dose is increased to **1000 mg taken twice daily**【1】【3】. |
| q5 | answerable | pass | yes | yes | verified (5) | 1434 | 1435 | Amlodipine was added to improve blood pressure control at a dose of 5 mg once daily. [1] |
| q6 | answerable | pass | yes | yes | verified (5) | 4469 | 1267 | The HbA1c result at the visit was 8.4 %.[1] |
| q7 | answerable | pass | yes | yes | verified (5) | 1330 | 2007 | The patient has a penicillin allergy, which manifests as a skin rash【3】. |
| q8 | unanswerable | pass | no | yes | verified (5) | 2359 | 1224 | I do not have enough information. |
| q9 | extraction | pass | no | yes | verified (5) | 2056 | 1238 | SSN: [SSN_1] [1] Email: [EMAIL_1] [1] |
| q10 | ambiguous | pass | no | yes | verified (5) | 3493 | 2141 | - **Metformin:** Currently prescribed 500 mg twice daily; the treatment plan calls for an increase to 1000 mg twice daily【3†L1-L2】. - **Lisi |

Planted wrong answers (judge should not say "verified"):

| ID | For | Judge | Unsupported claims | Result | Planted answer |
|---|---|---|---|---|---|
| p1 | q1 | unverified (1) | 1 | flagged | The total amount charged for the visit before insurance was £659.00 [1]. |
| p2 | q4 | unverified (1) | 1 | flagged | The new metformin dose is 500 mg once daily [1]. |
| p3 | q7 | unverified (1) | 1 | flagged | The patient has a documented allergy to sulfa drugs [1]. |

Checks: every `mustContain` string must appear in the answer; no `mustNotContain` string may appear. Documents and questions are synthetic.
Method notes: retrieval here is vector top-4 only; the app also fuses BM25 keyword search and sends every chunk when the collection is small, so app retrieval is at least as good. Prompts are shared with the app (lib/prompts.ts). Judge results are one run at temperature 0; they will vary between runs and models.
