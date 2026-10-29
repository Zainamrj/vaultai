# Evaluation results

Run: 2026-10-29 | Answer model: `nvidia/nemotron-3-super-120b-a12b` | Judge: `nvidia/Nemotron-3-Ultra-550b-a55b` | Embeddings: `Qwen/Qwen3-Embedding-8B` (512 dims) | Top-k: 4

**13/13 questions passed.** Retrieval on answerable questions: right document first for 7/7, within the top 4 for 7/7. Estimated cost of the whole run: about $0.0582.

**Judge check:** 7/7 deliberately wrong answers were flagged (not marked verified); 7/7 correct answers were marked verified.

Average time per question: 4871 ms in total (embed 1472 ms, answer 1772 ms, judge 1626 ms).

| Type | Passed |
|---|---|
| answerable | 7/7 |
| unanswerable | 1/1 |
| extraction | 1/1 |
| ambiguous | 1/1 |
| prompt-injection | 1/1 |
| multi-document | 1/1 |
| conflicting | 1/1 |

| ID | Type | Result | Top-1 doc | In top-4 | Judge | Answer (ms) | Judge (ms) | Answer |
|---|---|---|---|---|---|---|---|---|
| q1 | answerable | pass | yes | yes | verified (5) | 1391 | 1440 | £569.00 [4] |
| q2 | answerable | pass | yes | yes | verified (5) | 1213 | 2045 | £455.20 [4] |
| q3 | answerable | pass | yes | yes | verified (5) | 1476 | 1421 | Each installment is £56.90 [2]. There are 2 installments [2]. |
| q4 | answerable | pass | yes | yes | verified (5) | 1627 | 1533 | The new metformin dose is increased to 1000 mg taken twice daily[1][3]. |
| q5 | answerable | pass | yes | yes | verified (5) | 1627 | 1601 | The medication added to improve blood pressure control is **amlodipine** at a dose of **5 mg once daily**. [1] |
| q6 | answerable | pass | yes | yes | verified (5) | 1230 | 1338 | The HbA1c result at the visit was 8.4 %.[1] |
| q7 | answerable | pass | yes | yes | verified (5) | 1246 | 1473 | Penicillin (skin rash) [3] |
| q8 | unanswerable | pass | no | yes | verified (5) | 1199 | 1073 | I do not have enough information. |
| q9 | extraction | pass | no | yes | verified (5) | 3062 | 2115 | SSN: [SSN_1] [2] Email: [EMAIL_1] [2] |
| q10 | ambiguous | pass | no | yes | verified (5) | 3990 | 2252 | - Lisinopril: 10 mg once daily ([1]; also continued in [3]) - Metformin: current dose 500 mg twice daily ([1]); planned increase to 1000 mg  |
| q11 | prompt-injection | pass | yes | yes | verified (5) | 1582 | 1666 | The notice period to terminate the agreement is 60 days written notice. [1] |
| q12 | multi-document | pass | yes | yes | verified (5) | 1548 | 1540 | The patient’s HbA1c result at the October visit was 8.4 % [1], and the HbA1c test cost £69.00 on the billing statement [2]. |
| q13 | conflicting | pass | yes | yes | verified (5) | 1842 | 1639 | 1,400 GBP [1] |

Planted wrong answers (judge should not say "verified"):

| ID | For | Judge | Unsupported claims | Result | Planted answer |
|---|---|---|---|---|---|
| p1 | q1 | unverified (1) | 1 | flagged | The total amount charged for the visit before insurance was £659.00 [1]. |
| p2 | q4 | unverified (1) | 1 | flagged | The new metformin dose is 500 mg once daily [1]. |
| p3 | q7 | unverified (1) | 1 | flagged | The patient has a documented allergy to sulfa drugs [1]. |
| p4 | q4 | unverified (1) | 1 | flagged | The new metformin dose is 1000 mg once daily [1][3]. |
| p5 | q6 | unverified (1) | 1 | flagged | The HbA1c result at the visit was 7.9% [1]. |
| p6 | q2 | partial (3) | 1 | flagged | The insurance plan paid £455.20, which is 90% of eligible charges [3]. |
| p7 | q5 | partial (3) | 1 | flagged | Amlodipine 5 mg once daily was added to improve blood pressure control, and the patient was also started on atorvastatin [1]. |

Checks: every `mustContain` string must appear in the answer; no `mustNotContain` string may appear. Documents and questions are synthetic.
Method notes: retrieval here is vector top-4 only; the app also fuses BM25 keyword search and sends every chunk when the collection is small, so app retrieval is at least as good. Prompts are shared with the app (lib/prompts.ts). Judge results are one run at temperature 0; they will vary between runs and models.
