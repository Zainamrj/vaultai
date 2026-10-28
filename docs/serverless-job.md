# Running the eval as a Nebius Serverless Job (Day 5, task 5.7)

Why: it is a low-risk, credible use of Nebius Serverless. The job only calls Token Factory and prints a
results table; it never touches the live demo. Time-box it to about 90 minutes.

**Status: not run yet.** Do not claim it in the README or Devpost until it has actually run and you have its logs.
The exact `nebius` CLI flags were not verified: use `--help` and the Nebius Serverless docs.

## 1. Rehearse locally (5 min, needs Docker)

```bash
docker build -f Dockerfile.eval -t vaultai-eval .
docker run --rm --env-file .env.local vaultai-eval        # prints the results table between markers
```

`.dockerignore` excludes `.env*`, so the key is never copied into the image. It only exists as a runtime env var.

## 2. Push the image to a registry the job can pull from

```bash
docker tag vaultai-eval ghcr.io/<your-github-user>/vaultai-eval:latest
docker push ghcr.io/<your-github-user>/vaultai-eval:latest      # make the package public, or give the job pull credentials
```

The image contains only synthetic data and no secrets, so a public package is fine.

## 3. Create the job

```bash
nebius profile create          # authenticate the CLI
nebius ai --help               # find the job subcommand, then: nebius ai job create --help
```

Pass these as environment variables on the job (use a hackathon-only API key and revoke it afterwards):
`NEBIUS_API_KEY`, `NEBIUS_BASE_URL`, `MODEL_FAST`, `MODEL_MAIN`, `MODEL_JUDGE`, `MODEL_EMBED`.
Container command: the image default (`node --no-warnings scripts/eval.mjs`).

## 4. Capture the output

Copy everything between `----- results.md -----` and `----- end results.md -----` in the job logs into
`docs/eval/results.md`. Add one line at its top saying it was produced by a Nebius Serverless Job and when.
Screenshot the job page for the video (Token Factory usage + Serverless in one shot).

## 5. Only then, mention it

README "Where Token Factory accelerated our workflow" and the Devpost story, e.g.
"We run our evaluation as a Nebius Serverless Job." Skip this step if the job did not run.
