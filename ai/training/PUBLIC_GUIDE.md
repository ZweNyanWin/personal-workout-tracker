# Public local-training guide

PowerBuild trained QLoRA adapters on an existing Qwen foundation and exported separately named candidates. It did not pretrain a foundation model. The latest recorded candidate failed its behavior gate; see the [aggregate results](../reports/round9-public-summary.json).

## Included source

- `train_local.py`: records configurations, preserves run directories/checkpoints and reports local progress.
- `import_candidate.py`: fuses a checkpoint and prepares a separate versioned candidate; prints an Ollama import command without selecting a live model.
- `export_gguf.py`: uses a separately provisioned official llama.cpp converter to export/import a Q8_0 candidate. This is not the private round-9 Q4_K_M export procedure.
- `system.txt`: generic training system instructions.
- `prepare_demo_data.py`: eight newly written fictional records for testing the file-format pipeline. They are not the 228 historical training records, a representative fitness dataset or a benchmark.
- `ai/run-evals.mjs`: existing evaluation entry point. Published cases are regression fixtures, not an unseen exam.

The legacy runner's `val_batches=8` and `test_batches=4` use sampled diagnostics. Round 9's complete saved-checkpoint validation used additional private orchestration. The public tools and demo are not a one-command reproduction of that private experiment.

## Verify the demo without training

From the repository root:

```sh
python3 -m unittest discover -s ai/training -p 'test_public_demo.py'
python3 ai/training/prepare_demo_data.py --output ai/data/private/my-new-demo
python3 ai/training/train_local.py --help
```

The generator writes only under ignored `ai/data/private/`, creates a fresh output and refuses overwrites. It never reads personal plans, documents or held-out experiment files. It does not start a model, training or a deployment.

## Training prerequisites

The historical machine used Apple Silicon, 16 GB unified memory, Python 3.12, MLX 0.32.3 and MLX-LM 0.31.3. These are recorded versions, not a compatibility guarantee for another machine. Establish a separate environment and inspect its installed help before use. The helpers expect:

1. A local base snapshot with recorded revision/provenance. `$HOME/workout-ai/powerbuild-v1/base-path.txt` contains its absolute local directory; `base-provenance.json` records your own source/revision.
2. Compatible MLX/MLX-LM tools. The runner can create a 4-bit base at `$HOME/workout-ai/powerbuild-v1/qwen3-4b-mlx-4bit` from the supplied snapshot.
3. Reviewed JSONL files `train.jsonl`, `valid.jsonl`, `test.jsonl`, and a manifest with `counts.train`. The public demo exercises this format only; it is insufficient for a useful coaching model.
4. Loopback Ollama for local status operations. Training stops matching local coach model instances to free memory. Schedule isolated training with the serving connector stopped and no other GPU work.
5. For GGUF export, separately provisioned official converter tools, provenance and the layout expected by `export_gguf.py`. No model or converter binary is distributed here.

Example after those prerequisites and data review:

```sh
python3 ai/training/train_local.py \
  --data ai/data/private/my-reviewed-corpus \
  --iters 480 --max-seq-length 4096 --learning-rate 0.000003 \
  --num-layers 4 --rank 8 --scale 8 --save-every 80 --eval-every 80
```

Select checkpoints on complete held-out validation before behavioral acceptance review. Keep test questions out of training and preserve failures. Use an unused versioned candidate name; lower loss, schema validity and plausible prose do not prove better coaching.

Paths derive from the current user's home. Weights and local state are ignored. These helpers do not choose a production model, upload datasets to a service or deploy the app; local model operations can still interrupt inference and consume significant memory. Private checkpoints, client information, raw reviews and document copies are excluded.
